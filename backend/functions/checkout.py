"""
checkout.py — MachX Cycles Public Checkout Lambda

Routes:
  POST /checkout    — create order + Stripe PaymentIntent
  GET  /orders      — look up order by email + order_number
"""
import json
import logging
import uuid
import datetime

import boto3

from shared.config import STRIPE_SECRET_NAME, AWS_REGION
from shared.db import get_connection
from shared.response import success, error

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Stripe (lazy-loaded) ──────────────────────────────────────────────────────
_stripe = None


def _get_stripe():
    global _stripe
    if _stripe is not None:
        return _stripe
    import stripe as _s
    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp   = client.get_secret_value(SecretId=STRIPE_SECRET_NAME)
    keys   = json.loads(resp['SecretString'])
    _s.api_key = keys.get('secret_key', '')
    _stripe = _s
    return _stripe


# ── Entry point ───────────────────────────────────────────────────────────────

def handler(event, context):
    path   = event.get('path', '').rstrip('/')
    method = event.get('httpMethod', 'GET').upper()

    if method == 'OPTIONS':
        return success({})

    if path == '/checkout' and method == 'POST':
        return create_order(event)

    if path == '/orders' and method == 'GET':
        params = event.get('queryStringParameters') or {}
        return lookup_order(params)

    return error('Not found', status=404)


def _parse_body(event):
    raw = event.get('body') or '{}'
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


# ── Create Order ──────────────────────────────────────────────────────────────

def create_order(event):
    body = _parse_body(event)

    # Required fields
    for field in ('customer_name', 'customer_email', 'shipping_address', 'shipping_rate_id', 'items'):
        if not body.get(field):
            return error(f'{field} is required', status=400)

    if not body['items']:
        return error('Order must contain at least one item', status=400)

    addr = body['shipping_address']
    for f in ('line1', 'city', 'state', 'zip'):
        if not addr.get(f):
            return error(f'shipping_address.{f} is required', status=400)

    conn = get_connection()
    conn.commit()  # reset stale read snapshot

    try:
        with conn.cursor() as cur:
            # Validate shipping rate
            cur.execute(
                "SELECT id, price, name FROM shipping_rates WHERE id = %s AND is_active = 1",
                (body['shipping_rate_id'],)
            )
            shipping = cur.fetchone()
            if not shipping:
                return error('Invalid shipping rate', status=400)

            # Validate bikes and calculate totals
            line_items = []
            subtotal   = 0.0

            for item in body['items']:
                bike_id = item.get('bike_id')
                qty = 1  # Each bike is 1-of-1

                cur.execute(
                    """
                    SELECT b.id AS bike_id, b.base_price, b.name AS bike_name, b.sold
                    FROM bikes b
                    WHERE b.id = %s AND b.is_active = 1
                    FOR UPDATE
                    """,
                    (bike_id,)
                )
                bike = cur.fetchone()
                if not bike:
                    return error(f'Bike {bike_id} not found or inactive', status=400)

                if bike['sold']:
                    return error(
                        f'"{bike["bike_name"]}" is already sold',
                        status=409
                    )

                unit_price = float(bike['base_price'])
                subtotal += unit_price
                line_items.append({
                    'bike_id':    bike['bike_id'],
                    'frame_size': item.get('frame_size', ''),
                    'color':      item.get('color', ''),
                    'quantity':   qty,
                    'unit_price': unit_price,
                })

            # Validate promo code (optional)
            discount_amount = 0.0
            promo_code = (body.get('promo_code') or '').strip().upper()

            if promo_code:
                now = datetime.datetime.utcnow()
                cur.execute(
                    """
                    SELECT id, discount_type, discount_value
                    FROM promotions
                    WHERE promo_code = %s AND is_active = 1
                      AND start_date <= %s AND end_date >= %s
                    """,
                    (promo_code, now, now)
                )
                promo = cur.fetchone()
                if not promo:
                    return error('Invalid or expired promo code', status=400)

                if promo['discount_type'] == 'percentage':
                    discount_amount = round(subtotal * float(promo['discount_value']) / 100, 2)
                else:
                    discount_amount = min(float(promo['discount_value']), subtotal)

            # Totals
            shipping_fee = float(shipping['price'])
            total        = round(subtotal - discount_amount + shipping_fee, 2)

            # Order number
            date_str     = datetime.datetime.utcnow().strftime('%Y%m%d')
            order_number = f"MX-{date_str}-{uuid.uuid4().hex[:4].upper()}"

            # Insert order  (uses actual schema columns)
            cur.execute(
                """
                INSERT INTO orders
                    (order_number, customer_name, customer_email, customer_phone,
                     shipping_address, shipping_fee, subtotal, discount_amount, total,
                     fulfillment_type, payment_type, status, payment_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'ship', 'full', 'pending', 'unpaid')
                """,
                (
                    order_number,
                    body['customer_name'],
                    body['customer_email'],
                    body.get('customer_phone') or None,
                    json.dumps(addr),
                    shipping_fee,
                    round(subtotal, 2),
                    discount_amount,
                    total,
                )
            )
            order_id = cur.lastrowid

            # Insert order items
            for li in line_items:
                cur.execute(
                    """
                    INSERT INTO order_items
                        (order_id, bike_id, quantity, unit_price, frame_size, color)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (order_id, li['bike_id'],
                     li['quantity'], li['unit_price'], li['frame_size'], li['color'])
                )

            # Audit event
            cur.execute(
                "INSERT INTO order_events (order_id, event_type, message) VALUES (%s, 'created', 'Order placed')",
                (order_id,)
            )

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    # Create Stripe PaymentIntent (checkout Lambda is now outside VPC with internet access)
    client_secret = None

    try:
        stripe = _get_stripe()
        if stripe.api_key:
            pi = stripe.PaymentIntent.create(
                amount=int(total * 100),   # Stripe uses cents
                currency='usd',
                automatic_payment_methods={'enabled': True},
                metadata={
                    'order_id':     str(order_id),
                    'order_number': order_number,
                    'customer_email': body['customer_email'],
                },
                description=f'MachX Cycles – {order_number}',
            )
            client_secret = pi.client_secret

            # Store PaymentIntent ID
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE orders SET stripe_payment_intent_id = %s WHERE id = %s",
                    (pi.id, order_id)
                )
                cur.execute(
                    """INSERT INTO order_events (order_id, event_type, message, metadata)
                       VALUES (%s, 'stripe_pi_created', 'Stripe PaymentIntent created', %s)""",
                    (order_id, json.dumps({'payment_intent_id': pi.id}))
                )
            conn.commit()

    except Exception as e:
        logger.error(f"Stripe PI creation failed for order {order_id}: {e}")
        # Order is committed — frontend will handle missing client_secret as error

    return success({
        'order_id':      order_id,
        'order_number':  order_number,
        'total':         total,
        'client_secret': client_secret,
    }, status=201)


# ── Order Lookup ──────────────────────────────────────────────────────────────

def lookup_order(params):
    email        = (params.get('email') or '').strip()
    order_number = (params.get('order_number') or '').strip().upper()

    if not email or not order_number:
        return error('email and order_number are required', status=400)

    conn = get_connection()
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, order_number, status, payment_status,
                   subtotal, discount_amount, shipping_fee, total, created_at
            FROM orders
            WHERE customer_email = %s AND order_number = %s
            """,
            (email, order_number)
        )
        order = cur.fetchone()
        if not order:
            return error('Order not found', status=404)

        cur.execute(
            """
            SELECT oi.quantity, oi.unit_price, oi.frame_size, oi.color,
                   b.name AS bike_name
            FROM order_items oi
            JOIN bikes b ON b.id = oi.bike_id
            WHERE oi.order_id = %s
            """,
            (order['id'],)
        )
        order['items'] = cur.fetchall()

        cur.execute(
            """
            SELECT event_type, message, created_at
            FROM order_events
            WHERE order_id = %s ORDER BY created_at ASC
            """,
            (order['id'],)
        )
        order['events'] = cur.fetchall()

    return success(order)
