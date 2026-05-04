"""
checkout_db.py — MachX Cycles DB Operations for Checkout

Runs IN VPC for RDS access. Called by stripe-payment Lambda.

Input:
    {
        "action": "create_order",
        "customer_name": "...",
        "customer_email": "...",
        "customer_phone": "...",
        "shipping_address": {...},
        "shipping_rate_id": 1,
        "items": [{"variant_id": 1, "quantity": 1}],
        "promo_code": "..."  (optional)
    }

Output:
    {
        "order_id": 123,
        "order_number": "MX-20260225-ABCD",
        "total": 1549.99,
        "subtotal": 1499.99,
        "shipping_fee": 50.00,
        "discount_amount": 0
    }

Also supports:
    {"action": "update_payment_intent", "order_id": 123, "payment_intent_id": "pi_xxx"}
    {"action": "lookup_order", "email": "...", "order_number": "..."}
"""
import json
import logging
import uuid
import datetime

from shared.db import get_connection
from shared.response import success, error

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event, context):
    action = event.get('action', 'create_order')
    
    if action == 'create_order':
        return create_order(event)
    elif action == 'update_payment_intent':
        return update_payment_intent(event)
    elif action == 'lookup_order':
        return lookup_order(event)
    else:
        return {'error': f'Unknown action: {action}'}


def create_order(body):
    """Create order in database, return order details."""
    
    # Validate required fields
    for field in ('customer_name', 'customer_email', 'shipping_address', 'shipping_rate_id', 'items'):
        if not body.get(field):
            return {'error': f'{field} is required'}

    if not body['items']:
        return {'error': 'Order must contain at least one item'}

    addr = body['shipping_address']
    for f in ('line1', 'city', 'state', 'zip'):
        if not addr.get(f):
            return {'error': f'shipping_address.{f} is required'}

    conn = get_connection()
    conn.commit()  # reset stale read

    try:
        with conn.cursor() as cur:
            # Validate shipping rate
            cur.execute(
                "SELECT id, price, name FROM shipping_rates WHERE id = %s AND is_active = 1",
                (body['shipping_rate_id'],)
            )
            shipping = cur.fetchone()
            if not shipping:
                return {'error': 'Invalid shipping rate'}

            # Validate bikes and calculate totals
            line_items = []
            subtotal = 0.0

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
                    return {'error': f'Bike {bike_id} not found or inactive'}

                if bike['sold']:
                    return {'error': f'"{bike["bike_name"]}" is already sold'}

                unit_price = float(bike['base_price'])
                subtotal += unit_price
                line_items.append({
                    'bike_id': bike['bike_id'],
                    'frame_size': item.get('frame_size', ''),
                    'color': item.get('color', ''),
                    'quantity': qty,
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
                if promo:
                    if promo['discount_type'] == 'percentage':
                        discount_amount = round(subtotal * float(promo['discount_value']) / 100, 2)
                    else:
                        discount_amount = min(float(promo['discount_value']), subtotal)

            # Calculate totals
            shipping_fee = float(shipping['price'])
            total = round(subtotal - discount_amount + shipping_fee, 2)

            # Generate order number
            date_str = datetime.datetime.utcnow().strftime('%Y%m%d')
            order_number = f"MX-{date_str}-{uuid.uuid4().hex[:4].upper()}"

            # Insert order
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
        
        return {
            'order_id': order_id,
            'order_number': order_number,
            'total': total,
            'subtotal': round(subtotal, 2),
            'shipping_fee': shipping_fee,
            'discount_amount': discount_amount,
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"DB error creating order: {e}")
        return {'error': str(e)}


def update_payment_intent(body):
    """Store PaymentIntent ID on order after Stripe creates it."""
    order_id = body.get('order_id')
    payment_intent_id = body.get('payment_intent_id')
    
    if not order_id or not payment_intent_id:
        return {'error': 'order_id and payment_intent_id required'}
    
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE orders SET stripe_payment_intent_id = %s WHERE id = %s",
                (payment_intent_id, order_id)
            )
            cur.execute(
                """INSERT INTO order_events (order_id, event_type, message, metadata)
                   VALUES (%s, 'stripe_pi_created', 'Stripe PaymentIntent created', %s)""",
                (order_id, json.dumps({'payment_intent_id': payment_intent_id}))
            )
        conn.commit()
        return {'success': True}
    except Exception as e:
        conn.rollback()
        return {'error': str(e)}


def lookup_order(body):
    """Look up order by email and order number."""
    email = (body.get('email') or '').strip()
    order_number = (body.get('order_number') or '').strip().upper()

    if not email or not order_number:
        return {'error': 'email and order_number are required'}

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
            return {'error': 'Order not found'}

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
        items = cur.fetchall()

    return {
        'order': order,
        'items': items
    }
