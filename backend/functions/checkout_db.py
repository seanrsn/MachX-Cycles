"""
checkout_db.py — MachX Cycles DB operations for the checkout flow.

ARCHITECTURE: orders are paid-only.

In-flight checkouts live in `checkout_sessions`. The `orders` table only ever
contains real, paid orders — every row there represents money that actually
moved. Sessions get *materialized* into orders by stripe_webhook on
`payment_intent.succeeded`. Abandoned/expired sessions never become orders.

Actions:
    create_session       — start a new checkout session, reserve the bike(s)
    update_session_pi    — store Stripe PI id on the session, extend reservation
    lookup_order         — customer-facing order lookup by email + order_number

The webhook Lambda (stripe_webhook.py) handles materialization. This file
doesn't know about Stripe — only sessions, orders, and reservations.
"""
import json
import logging
import secrets
import uuid
import datetime

from shared.db import get_connection
from shared.response import success, error, _Encoder  # noqa: F401 — kept for parity

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _jsonable(result):
    """Strip datetime/Decimal/etc. from the result so Lambda's runtime
    serializer (which doesn't know about our custom encoder) can marshal it
    across the sync-invoke boundary to stripe-payment. Without this, any
    raw datetime in the result triggers Runtime.MarshalError on the caller
    side and they see a 502 instead of their lookup result."""
    return json.loads(json.dumps(result, cls=_Encoder))


def handler(event, context):
    action = event.get('action', 'create_session')

    if action == 'create_session':
        return _jsonable(create_session(event))
    elif action == 'update_session_pi':
        return _jsonable(update_session_pi(event))
    elif action == 'lookup_order':
        return _jsonable(lookup_order(event))
    # Backwards compat: stripe-payment may still send the old names during
    # rollout. Map them to the new ones.
    elif action == 'create_order':
        return _jsonable(create_session(event))
    elif action == 'update_payment_intent':
        return _jsonable(update_session_pi({
            **event,
            'session_id': event.get('order_id') or event.get('session_id'),
        }))
    else:
        return {'error': f'Unknown action: {action}'}


# ── create_session ───────────────────────────────────────────────────────────

def create_session(body):
    """Create a checkout session and reserve the bike(s). Does NOT create an
    `orders` row — that happens in stripe_webhook on payment success."""

    for field in ('customer_name', 'customer_email', 'shipping_address', 'shipping_rate_id', 'items'):
        if not body.get(field):
            return {'error': f'{field} is required'}

    if not body['items']:
        return {'error': 'Order must contain at least one item'}

    addr = body['shipping_address']
    for f in ('line1', 'city', 'state', 'zip'):
        if not addr.get(f):
            return {'error': f'shipping_address.{f} is required'}

    customer_email_lc = (body.get('customer_email') or '').strip().lower()
    buyer_token       = (body.get('buyer_token') or '').strip()

    conn = get_connection()
    conn.commit()  # reset stale read snapshot

    try:
        with conn.cursor() as cur:
            # 1. Validate shipping rate
            cur.execute(
                "SELECT id, price, name FROM shipping_rates WHERE id = %s AND is_active = 1",
                (body['shipping_rate_id'],)
            )
            shipping = cur.fetchone()
            if not shipping:
                return {'error': 'Invalid shipping rate'}

            # 2. Same-buyer takeover.
            # ONLY match on buyer_token (localStorage UUID). Email match was
            # removed because it's a free DoS vector — anyone who knows a
            # customer's email could spam /checkout with that email and clobber
            # their in-flight session, kicking them out of their own checkout.
            # buyer_token is generated per-browser, never sent over email,
            # never logged anywhere a third party can read.
            requested_bike_ids = [item.get('bike_id') for item in body['items'] if item.get('bike_id')]
            if requested_bike_ids and buyer_token:
                placeholders = ','.join(['%s'] * len(requested_bike_ids))
                cur.execute(
                    f"""
                    SELECT b.id AS bike_id, s.id AS session_id
                    FROM bikes b
                    JOIN checkout_sessions s ON s.id = b.reservation_session_id
                    WHERE b.id IN ({placeholders})
                      AND b.sold = 0
                      AND b.reservation_state IN ('soft','pi_created')
                      AND s.status = 'active'
                      AND s.buyer_token = %s
                    """,
                    requested_bike_ids + [buyer_token]
                )
                stale = cur.fetchall()
                for row in stale:
                    cur.execute(
                        """
                        UPDATE bikes
                        SET reservation_state = 'none',
                            reserved_until = NULL,
                            reservation_session_id = NULL
                        WHERE id = %s AND reservation_session_id = %s AND sold = 0
                        """,
                        (row['bike_id'], row['session_id'])
                    )
                    cur.execute(
                        "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s AND status = 'active'",
                        (row['session_id'],)
                    )

            # 3. Validate bikes + calculate totals
            line_items = []
            subtotal = 0.0
            bikes_to_reserve = []  # (bike_id, name) pairs — reserve after session insert

            for item in body['items']:
                bike_id = item.get('bike_id')
                if not bike_id:
                    return {'error': 'bike_id is required for each item'}

                cur.execute(
                    """
                    SELECT b.id AS bike_id, b.base_price, b.name AS bike_name, b.sold,
                           b.reservation_state, b.reserved_until, b.reservation_session_id
                    FROM bikes b
                    WHERE b.id = %s AND b.is_active = 1
                    FOR UPDATE
                    """,
                    (bike_id,)
                )
                bike = cur.fetchone()
                if not bike:
                    # Don't leak the internal bike_id in user-facing copy.
                    # `code: item_unavailable` lets the frontend prune the
                    # offending cart entry automatically.
                    return {
                        'error': 'One of the bikes in your cart is no longer available.',
                        'code': 'item_unavailable',
                        'unavailable_bike_id': bike_id,
                    }
                if bike['sold']:
                    return {
                        'error': f'"{bike["bike_name"]}" is already sold.',
                        'code': 'item_sold',
                        'unavailable_bike_id': bike_id,
                    }

                state = bike['reservation_state']
                rsvd  = bike['reserved_until']
                now   = datetime.datetime.utcnow()
                blocking = (
                    state == 'processing'
                    or (state in ('soft', 'pi_created') and rsvd and rsvd > now)
                )
                if blocking:
                    return {'error': f'"{bike["bike_name"]}" is currently in another shopper\'s checkout. Please try again in a few minutes.'}

                bikes_to_reserve.append((bike['bike_id'], bike['bike_name']))
                unit_price = float(bike['base_price'])
                subtotal += unit_price
                line_items.append({
                    'bike_id':    bike['bike_id'],
                    'bike_name':  bike['bike_name'],
                    'quantity':   1,
                    'unit_price': unit_price,
                })

            # 4. Promo code — enforce all the gates the schema implies:
            #    - active + within date window
            #    - subtotal >= min_order_amount (if set)
            #    - usage_count < max_uses (if set)
            #    - applies_to scope (all/category/bike) matches the cart
            # The actual usage_count increment happens at materialization time
            # (in stripe_webhook on succeeded), atomically. Here we just
            # validate and compute the discount.
            discount_amount = 0.0
            promo_code = (body.get('promo_code') or '').strip().upper()
            if promo_code:
                now = datetime.datetime.utcnow()
                cur.execute(
                    """
                    SELECT id, discount_type, discount_value, min_order_amount,
                           applies_to, category_id AS scope_category_id, bike_id AS scope_bike_id,
                           usage_count, max_uses
                    FROM promotions
                    WHERE promo_code = %s
                      AND is_active = 1
                      AND start_date <= %s AND end_date >= %s
                    """,
                    (promo_code, now, now)
                )
                promo = cur.fetchone()
                if promo:
                    # Min order amount
                    if promo['min_order_amount'] is not None and subtotal < float(promo['min_order_amount']):
                        return {'error': f'Promo code requires a minimum order of ${float(promo["min_order_amount"]):.2f}'}
                    # Usage cap
                    if promo['max_uses'] is not None and promo['usage_count'] >= promo['max_uses']:
                        return {'error': 'This promo code has reached its usage limit'}
                    # Scope
                    if promo['applies_to'] == 'category' and promo['scope_category_id']:
                        cur.execute(
                            f"SELECT 1 FROM bikes WHERE id IN ({','.join(['%s']*len(requested_bike_ids))}) AND category_id = %s",
                            requested_bike_ids + [promo['scope_category_id']]
                        )
                        if not cur.fetchone():
                            return {'error': "Promo code doesn't apply to the items in your cart"}
                    elif promo['applies_to'] == 'bike' and promo['scope_bike_id']:
                        if promo['scope_bike_id'] not in requested_bike_ids:
                            return {'error': "Promo code doesn't apply to the items in your cart"}
                    # Compute discount
                    if promo['discount_type'] == 'percentage':
                        discount_amount = round(subtotal * float(promo['discount_value']) / 100, 2)
                    else:
                        discount_amount = min(float(promo['discount_value']), subtotal)

            shipping_fee = float(shipping['price'])
            total        = round(subtotal - discount_amount + shipping_fee, 2)

            # 5. Generate identifiers
            #    Order number = MX- + 8 chars from a confusion-resistant alphabet.
            #    Skips 0/O/1/I/L so customers reading it aloud over the phone
            #    can't garble it. ~2 trillion combos at 8 chars — collisions are
            #    astronomically unlikely; we don't need a uniqueness re-roll.
            session_token = uuid.uuid4().hex
            _ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # 31 chars (no 0/O/1/I/L)
            order_number  = 'MX-' + ''.join(secrets.choice(_ALPHA) for _ in range(8))
            expires_at    = datetime.datetime.utcnow() + datetime.timedelta(minutes=30)

            # 6. Insert session
            cur.execute(
                """
                INSERT INTO checkout_sessions
                    (session_token, order_number, buyer_token,
                     customer_email, customer_name, customer_phone,
                     shipping_address, shipping_rate_id, shipping_fee,
                     subtotal, discount_amount, total, promo_code,
                     items, status, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', %s)
                """,
                (
                    session_token,
                    order_number,
                    buyer_token or None,
                    body['customer_email'],
                    body['customer_name'],
                    body.get('customer_phone') or None,
                    json.dumps(addr),
                    body['shipping_rate_id'],
                    shipping_fee,
                    round(subtotal, 2),
                    discount_amount,
                    total,
                    promo_code or None,
                    json.dumps(line_items),
                    expires_at,
                )
            )
            session_id = cur.lastrowid

            # 7. Reserve bikes (cart phase, 5-min TTL)
            for bike_id, bike_name in bikes_to_reserve:
                cur.execute(
                    """
                    UPDATE bikes
                    SET reservation_state = 'soft',
                        reserved_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),
                        reservation_session_id = %s
                    WHERE id = %s
                      AND sold = 0
                      AND is_active = 1
                      AND (
                        reservation_state = 'none'
                        OR (reservation_state IN ('soft','pi_created')
                            AND (reserved_until IS NULL OR reserved_until < UTC_TIMESTAMP()))
                        OR reservation_session_id = %s
                      )
                    """,
                    (session_id, bike_id, session_id)
                )
                if cur.rowcount == 0:
                    conn.rollback()
                    return {'error': f'"{bike_name}" was just reserved by another shopper. Please try again in a few minutes.'}

        conn.commit()

        # Return the same shape the old create_order returned for backwards
        # compatibility with stripe_payment.py. session_id replaces order_id;
        # order_number is pre-generated and will transfer to the real order
        # at materialization time.
        return {
            'session_id':      session_id,
            'order_id':        session_id,  # legacy alias for stripe-payment
            'order_number':    order_number,
            'total':           total,
            'subtotal':        round(subtotal, 2),
            'shipping_fee':    shipping_fee,
            'discount_amount': discount_amount,
        }

    except Exception as e:
        conn.rollback()
        logger.exception("DB error creating session")
        return {'error': 'Internal error'}


# ── update_session_pi ────────────────────────────────────────────────────────

def update_session_pi(body):
    """Store the Stripe PaymentIntent id on the session and extend the bike
    reservation to 10 min — the buyer is now on the Stripe form."""
    session_id        = body.get('session_id')
    payment_intent_id = body.get('payment_intent_id')

    if not session_id or not payment_intent_id:
        return {'error': 'session_id and payment_intent_id required'}

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE checkout_sessions
                SET stripe_payment_intent_id = %s
                WHERE id = %s AND status = 'active'
                """,
                (payment_intent_id, session_id)
            )
            cur.execute(
                """
                UPDATE bikes
                SET reservation_state = 'pi_created',
                    reserved_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)
                WHERE reservation_session_id = %s AND sold = 0
                """,
                (session_id,)
            )
        conn.commit()
        return {'success': True}
    except Exception as e:
        conn.rollback()
        logger.exception("DB error updating session PI")
        return {'error': 'Internal error'}


# ── lookup_order ─────────────────────────────────────────────────────────────

_CARRIER_TRACKING_URLS = {
    'BIKEFLIGHTS': 'https://www.bikeflights.com/track?tracking={n}',
    'UPS':         'https://www.ups.com/track?tracknum={n}',
    'FEDEX':       'https://www.fedex.com/fedextrack/?trknbr={n}',
    'USPS':        'https://tools.usps.com/go/TrackConfirmAction?tLabels={n}',
}

def _tracking_url(carrier, number):
    """Build a public click-through tracking URL. Returns None for OTHER or
    when carrier/number missing."""
    if not carrier or not number:
        return None
    tmpl = _CARRIER_TRACKING_URLS.get(carrier.upper())
    return tmpl.replace('{n}', str(number)) if tmpl else None


def lookup_order(body):
    """Customer-facing lookup. Checks `orders` (real, paid orders) first;
    falls back to `checkout_sessions` so a customer who just paid can find
    their order in the brief window before the webhook materializes it."""
    email        = (body.get('email') or '').strip()
    order_number = (body.get('order_number') or '').strip().upper()

    if not email or not order_number:
        return {'error': 'email and order_number are required'}
    if len(email) > 254 or len(order_number) > 30:
        return {'error': 'Order not found'}

    conn = get_connection()
    conn.commit()

    with conn.cursor() as cur:
        # Real, paid order
        cur.execute(
            """
            SELECT id, order_number, status, payment_status,
                   subtotal, discount_amount, shipping_fee, total, created_at,
                   tracking_number, tracking_carrier, shipped_at, estimated_delivery
            FROM orders
            WHERE customer_email = %s AND order_number = %s
            """,
            (email, order_number)
        )
        order = cur.fetchone()
        if order:
            # Append a public tracking URL based on carrier so the frontend
            # doesn't have to maintain its own URL templates.
            order['tracking_url'] = _tracking_url(order.get('tracking_carrier'), order.get('tracking_number'))

            cur.execute(
                """
                SELECT oi.id, oi.bike_id, oi.quantity, oi.unit_price,
                       b.name AS bike_name, b.frame_size, b.material
                FROM order_items oi
                JOIN bikes b ON b.id = oi.bike_id
                WHERE oi.order_id = %s
                """,
                (order['id'],)
            )
            items = cur.fetchall()

            # Public-facing event timeline. Filter to types meaningful to the
            # customer (skip internal ones like admin_release_reservation etc.)
            cur.execute(
                """
                SELECT event_type, message, created_at
                FROM order_events
                WHERE order_id = %s
                  AND event_type IN ('created','status_change','shipped','payment_succeeded','delivered','cancelled')
                ORDER BY created_at ASC
                """,
                (order['id'],)
            )
            events = cur.fetchall()

            return {'order': order, 'items': items, 'events': events}

        # Pending session — payment may have just succeeded but webhook hasn't
        # materialized yet. Show a "processing" placeholder so the customer
        # knows their payment was received.
        cur.execute(
            """
            SELECT id, order_number, items, total, subtotal, shipping_fee,
                   discount_amount, status, stripe_payment_intent_id, created_at
            FROM checkout_sessions
            WHERE customer_email = %s AND order_number = %s AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (email, order_number)
        )
        session = cur.fetchone()
        if session:
            session_items = json.loads(session['items']) if isinstance(session['items'], str) else session['items']
            return {
                'order': {
                    'id':              None,
                    'order_number':    session['order_number'],
                    'status':          'processing',
                    'payment_status':  'processing',
                    'subtotal':        float(session['subtotal']),
                    'discount_amount': float(session['discount_amount'] or 0),
                    'shipping_fee':    float(session['shipping_fee'] or 0),
                    'total':           float(session['total']),
                    'created_at':      session['created_at'],
                },
                'items': [
                    {
                        'bike_id':    i.get('bike_id'),
                        'quantity':   i.get('quantity', 1),
                        'unit_price': i.get('unit_price', 0),
                        'bike_name':  i.get('bike_name', ''),
                    }
                    for i in session_items
                ],
                'pending_materialization': True,
            }

        return {'error': 'Order not found'}
