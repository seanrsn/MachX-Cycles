"""
stripe_webhook.py — MachX Cycles Stripe Webhook Lambda

Receives POST /webhook/stripe from Stripe (no Cognito auth — open endpoint).
Verifies the Stripe-Signature header, then processes payment events.

Handled events:
  payment_intent.succeeded      → mark order paid, status = confirmed, SMS notification
  payment_intent.payment_failed → log failure, keep unpaid
"""
import base64
import json
import logging
import os
import secrets
import time

import boto3

from shared.config import STRIPE_SECRET_NAME, AWS_REGION
from shared.db import get_connection
from shared.response import success, error

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Secrets (lazy-loaded) ─────────────────────────────────────────────────────
_stripe_keys = None

# Phone number to notify on new orders (can also be env var)
NOTIFY_PHONE = os.environ.get('NOTIFY_PHONE', '+19177530685')

# S3 queue for outbound notifications (SMS + customer emails). This Lambda
# runs INSIDE the VPC (for RDS access) and the VPC has no NAT, so we can't
# reach api.twilio.com or api.resend.com directly. We drop a trigger JSON
# in s3://machx-cycles-frontend/regen-queue/ and an S3 ObjectCreated event
# fires the non-VPC sibling Lambda (machx-bike-html-regen) which actually
# makes the outbound API calls. Same pattern as admin-api's shipped-email.
NOTIFY_QUEUE_BUCKET = os.environ.get('NOTIFY_QUEUE_BUCKET', 'machx-cycles-frontend')


def _get_stripe_keys():
    global _stripe_keys
    if _stripe_keys is not None:
        return _stripe_keys
    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp   = client.get_secret_value(SecretId=STRIPE_SECRET_NAME)
    _stripe_keys = json.loads(resp['SecretString'])
    return _stripe_keys


def _send_sms(message: str):
    """Queue an SMS-to-admin via S3 → bike_html_regen sibling Lambda.
    Best-effort: never raises. The webhook returns 200 even if queueing fails."""
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        key = f"regen-queue/sms-{int(time.time() * 1000)}-{secrets.token_hex(3)}.json"
        s3.put_object(
            Bucket=NOTIFY_QUEUE_BUCKET,
            Key=key,
            Body=json.dumps({
                'action':  'send_admin_sms',
                'message': message,
                'to':      NOTIFY_PHONE,
            }).encode('utf-8'),
            ContentType='application/json',
        )
        logger.info(f"Queued admin SMS via {key}")
    except Exception as e:
        # Twilio/Resend failures shouldn't break the webhook either way
        logger.error(f"Failed to queue SMS: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────

def handler(event, context):
    method = event.get('httpMethod', 'POST').upper()

    if method == 'OPTIONS':
        return success({})

    if method != 'POST':
        return error('Method not allowed', status=405)

    # Raw body — Stripe requires the exact raw bytes for signature verification
    raw_body = event.get('body') or ''
    if event.get('isBase64Encoded'):
        raw_body = base64.b64decode(raw_body).decode('utf-8')

    # Find Stripe-Signature header (API Gateway may lowercase headers)
    headers    = event.get('headers') or {}
    sig_header = headers.get('Stripe-Signature') or headers.get('stripe-signature') or ''

    if not sig_header:
        logger.warning("Missing Stripe-Signature header")
        return error('Missing Stripe-Signature header', status=400)

    keys           = _get_stripe_keys()
    webhook_secret = keys.get('webhook_secret', '')
    secret_key     = keys.get('secret_key', '')

    if not webhook_secret or not secret_key:
        logger.error("Stripe keys not configured in Secrets Manager")
        return error('Webhook not configured', status=500)

    import stripe
    stripe.api_key = secret_key

    try:
        evt = stripe.Webhook.construct_event(raw_body, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed")
        return error('Invalid signature', status=400)
    except Exception as e:
        logger.error(f"Webhook parse error: {e}")
        return error('Invalid webhook payload', status=400)

    event_type = evt['type']
    event_id   = evt['id']
    pi         = evt['data']['object']
    logger.info(f"Stripe event: {event_type} | id: {event_id} | PI: {pi.get('id')}")

    # Idempotency: skip if already FULLY processed.
    # Critical ordering: we check processed_stripe_events at the top, but only
    # CLAIM (insert) the event AFTER the handler completes successfully. If the
    # Lambda times out mid-processing, the event isn't claimed and Stripe's
    # retry can re-process it. Was claim-then-process — caused real lost orders
    # when handlers ran near the 30s Lambda timeout.
    if _is_event_processed(event_id):
        logger.info(f"Event {event_id} already processed — skipping")
        return success({'received': True, 'duplicate': True})

    # Run the handler. Materialization itself is idempotent — checks
    # checkout_sessions.status == 'converted' and orders.order_number unique
    # before inserting — so even if two concurrent retries somehow race past
    # the _is_event_processed check, the worst case is a wasted Lambda
    # invocation, not a double-fulfilled order.
    if event_type == 'payment_intent.processing':
        _handle_payment_processing(pi, secret_key)
    elif event_type == 'payment_intent.succeeded':
        _handle_payment_succeeded(pi, secret_key)
    elif event_type == 'payment_intent.payment_failed':
        _handle_payment_failed(pi)
    elif event_type == 'payment_intent.canceled':
        _handle_payment_canceled(pi)
    else:
        logger.info(f"Unhandled event type (ignored): {event_type}")

    # Mark event as processed only after the handler returned without error.
    _mark_event_processed(event_id, event_type)

    return success({'received': True})


def _is_event_processed(event_id: str) -> bool:
    """True if this event_id has already been fully processed (i.e. previously
    completed _mark_event_processed)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM processed_stripe_events WHERE event_id = %s LIMIT 1",
                (event_id,)
            )
            return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"Failed to check event {event_id}: {e}")
        # On error, fail-open (process the event) — better to risk a duplicate
        # than to silently drop a real payment. Materialization is idempotent
        # via UNIQUE on order_number.
        return False


def _mark_event_processed(event_id: str, event_type: str) -> None:
    """Record successful processing so retries skip. Called only after handler
    completes without raising."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO processed_stripe_events (event_id, event_type) VALUES (%s, %s)",
                (event_id, event_type)
            )
        conn.commit()
    except Exception as e:
        logger.error(f"Failed to mark event {event_id} processed: {e}")
        # Non-fatal. The handler already ran successfully; we just lose the
        # idempotency guarantee for retries. Materialization itself stays safe
        # via order_number UNIQUE.


# ── Event handlers ────────────────────────────────────────────────────────────

def _handle_payment_processing(pi, secret_key):
    """payment_intent.processing fires when the buyer clicks Pay in the Stripe
    form (before the card auth completes). Upgrade reservation to a permanent
    lock. If the session lost its reservation (TTL expired, race), cancel the
    PI before authorization to avoid charging."""
    pi_id = pi['id']
    conn  = get_connection()
    conn.commit()

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, order_number, items FROM checkout_sessions WHERE stripe_payment_intent_id = %s AND status = 'active'",
                (pi_id,)
            )
            session = cur.fetchone()
            if not session:
                logger.warning(f"payment_intent.processing: no active session for PI {pi_id}")
                return

            session_id = session['id']
            session_no = session['order_number']
            items = json.loads(session['items']) if isinstance(session['items'], str) else session['items']
            expected = len(items)

            cur.execute(
                """
                UPDATE bikes
                SET reservation_state = 'processing',
                    reserved_until = NULL
                WHERE reservation_session_id = %s AND sold = 0
                """,
                (session_id,)
            )
            owned = cur.rowcount

            if owned < expected:
                logger.warning(
                    f"Race lost during processing: session {session_no} owns {owned}/{expected} reservations. Canceling PI."
                )
                _cancel_payment_intent(pi_id, secret_key)
                # Roll back any partial wins — the bikes we DID promote to
                # 'processing' would be stuck with no TTL and a now-abandoned
                # session id. Release them so the next buyer can grab them.
                cur.execute(
                    """
                    UPDATE bikes
                    SET reservation_state = 'none',
                        reserved_until = NULL,
                        reservation_session_id = NULL
                    WHERE reservation_session_id = %s AND sold = 0
                    """,
                    (session_id,)
                )
                cur.execute(
                    "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s",
                    (session_id,)
                )
            else:
                logger.info(f"Session {session_no} reservation locked (processing)")

        conn.commit()

    except Exception:
        conn.rollback()
        raise


def _cancel_payment_intent(pi_id: str, secret_key: str):
    """Cancel a PaymentIntent before charge completes. Stripe allows cancel
    from `processing` state but not from `succeeded` — so this is best-effort
    and may fail if the auth completed first. If it fails, the succeeded
    handler will catch the race and refund instead.

    Idempotency key prevents a webhook retry from issuing a second cancel
    request (Stripe would reject but it's noise in logs)."""
    try:
        import stripe
        stripe.api_key = secret_key
        stripe.PaymentIntent.cancel(
            pi_id,
            cancellation_reason='abandoned',
            idempotency_key=f'cancel-{pi_id}',
        )
        logger.info(f"PI {pi_id} canceled (race-lost during processing)")
    except Exception as e:
        logger.error(f"Failed to cancel PI {pi_id}: {e} — succeeded handler will refund if charge completes")


def _handle_payment_succeeded(pi, secret_key):
    """Materialize the checkout session into a real order. This is the only
    path that creates rows in `orders` / `order_items` — every row in those
    tables represents a real, paid order."""
    pi_id = pi['id']
    conn  = get_connection()
    conn.commit()

    order_info       = None
    race_lost        = False
    fake_order_for_refund = None  # used by _refund_race_loser if race detected

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, order_number, buyer_token, customer_name, customer_email,
                       customer_phone, shipping_address, shipping_rate_id, shipping_fee,
                       subtotal, discount_amount, tax_amount, tax_calculation_id,
                       total, promo_code, items, status,
                       converted_to_order_id
                FROM checkout_sessions
                WHERE stripe_payment_intent_id = %s
                """,
                (pi_id,)
            )
            session = cur.fetchone()
            if not session:
                logger.warning(f"payment_intent.succeeded: no session for PI {pi_id}")
                return

            session_id = session['id']
            order_number = session['order_number']

            # If session is already converted (duplicate webhook), no-op. The
            # idempotency table at the top of handler() should catch this, but
            # belt-and-suspenders.
            if session['status'] == 'converted':
                cur.execute(
                    "SELECT id FROM orders WHERE order_number = %s",
                    (order_number,)
                )
                existing = cur.fetchone()
                logger.info(f"Session {order_number} already converted to order {existing['id'] if existing else 'unknown'}")
                return

            items = json.loads(session['items']) if isinstance(session['items'], str) else session['items']
            expected = len(items)
            bike_ids = [i['bike_id'] for i in items]

            # Atomically mark bikes sold — but only if this session still owns
            # the reservation. If another session took over (race), rowcount
            # will be < expected and we refund.
            cur.execute(
                """
                UPDATE bikes
                SET sold = 1,
                    reservation_state = 'sold',
                    reserved_until = NULL
                WHERE reservation_session_id = %s
                  AND sold = 0
                """,
                (session_id,)
            )
            owned = cur.rowcount

            if owned < expected:
                race_lost = True
                logger.error(
                    f"RACE LOST AT SUCCEEDED: session {order_number} got {owned}/{expected} bikes sold, refunding"
                )
                cur.execute(
                    "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s",
                    (session_id,)
                )
                # Use session data as a stand-in for the "order" passed to refund handler
                fake_order_for_refund = {
                    'id':             None,
                    'order_number':   order_number,
                    'customer_email': session['customer_email'],
                    'customer_name':  session['customer_name'],
                    'total':          session['total'],
                }
            else:
                # MATERIALIZE: insert the real order + order_items.
                shipping_address_json = session['shipping_address']
                if isinstance(shipping_address_json, dict):
                    shipping_address_json = json.dumps(shipping_address_json)

                cur.execute(
                    """
                    INSERT INTO orders
                        (order_number, customer_name, customer_email, customer_phone,
                         fulfillment_type, payment_type,
                         shipping_address, shipping_fee, subtotal, discount_amount, tax, total,
                         tax_calculation_id,
                         stripe_payment_intent_id, stripe_latest_charge_id,
                         payment_status, status, notes)
                    VALUES (%s, %s, %s, %s, 'ship', 'full',
                            %s, %s, %s, %s, %s, %s,
                            %s,
                            %s, %s,
                            'paid', 'confirmed', NULL)
                    """,
                    (
                        order_number,
                        session['customer_name'],
                        session['customer_email'],
                        session['customer_phone'],
                        shipping_address_json,
                        session['shipping_fee'],
                        session['subtotal'],
                        session['discount_amount'],
                        session.get('tax_amount') or 0,
                        session['total'],
                        session.get('tax_calculation_id'),
                        pi_id,
                        pi.get('latest_charge'),
                    )
                )
                order_id = cur.lastrowid

                # order_items: one per bike
                for it in items:
                    cur.execute(
                        """
                        INSERT INTO order_items
                            (order_id, bike_id, quantity, unit_price)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            order_id,
                            it['bike_id'],
                            it.get('quantity', 1),
                            it['unit_price'],
                        )
                    )

                # Audit
                cur.execute(
                    """
                    INSERT INTO order_events (order_id, event_type, message, metadata)
                    VALUES (%s, 'created', 'Order placed', %s)
                    """,
                    (order_id, json.dumps({'session_id': session_id, 'payment_intent_id': pi_id}))
                )
                cur.execute(
                    """
                    INSERT INTO order_events (order_id, event_type, message, metadata)
                    VALUES (%s, 'payment_received', 'Payment received', %s)
                    """,
                    (order_id, json.dumps({'payment_intent_id': pi_id}))
                )

                # Mark session as converted
                cur.execute(
                    "UPDATE checkout_sessions SET status = 'converted', converted_to_order_id = %s WHERE id = %s",
                    (order_id, session_id)
                )

                # Atomic promo usage increment. WHERE max_uses IS NULL OR
                # usage_count < max_uses ensures we never exceed the cap even
                # under simultaneous redemptions. If rowcount is 0 the cap was
                # hit between session-create-time validation and now — log it,
                # but the order still stands (we already validated at create
                # time and the buyer paid).
                if session.get('promo_code'):
                    cur.execute(
                        """
                        UPDATE promotions
                        SET usage_count = usage_count + 1
                        WHERE promo_code = %s
                          AND is_active = 1
                          AND (max_uses IS NULL OR usage_count < max_uses)
                        """,
                        (session['promo_code'],)
                    )
                    if cur.rowcount == 0:
                        logger.warning(
                            f"Promo {session['promo_code']} usage_count not incremented for order {order_number} — promo may have hit its cap or been deactivated"
                        )

                order_info = {
                    'order_number':       order_number,
                    'order_id':           order_id,
                    'customer_name':      session['customer_name'],
                    'customer_email':     session['customer_email'],
                    'customer_phone':     session['customer_phone'],
                    'total':              float(session['total']),
                    'tax':                float(session.get('tax_amount') or 0),
                    'tax_calculation_id': session.get('tax_calculation_id'),
                    'items':              [
                        {
                            'bike_name': it.get('bike_name', f"Bike #{it.get('bike_id')}"),
                            'quantity':  it.get('quantity', 1),
                        }
                        for it in items
                    ],
                    'shipping_address':   session['shipping_address'],
                }

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    # Race-lost path: refund the buyer + alert admin
    if race_lost:
        _refund_race_loser(pi_id, fake_order_for_refund, secret_key)
        return

    logger.info(f"Order {order_number} materialized, marked paid / confirmed")

    # Happy-path SMS notification (after DB commit)
    if order_info:
        items_text = ", ".join([
            f"{i['bike_name']}" + (f" x{i['quantity']}" if i.get('quantity', 1) > 1 else '')
            for i in order_info['items']
        ])

        # Parse shipping address
        addr = order_info['shipping_address']
        if isinstance(addr, str):
            addr = json.loads(addr)
        addr_text = f"{addr.get('city', '')}, {addr.get('state', '')}" if addr else "N/A"

        sms_message = (
            f"🚴 NEW ORDER: {order_info['order_number']}\n"
            f"💰 ${order_info['total']:.2f}\n"
            f"👤 {order_info['customer_name']}\n"
            f"📍 {addr_text}\n"
            f"📦 {items_text}\n"
            f"📧 {order_info['customer_email']}"
        )

        _send_sms(sms_message)
        _send_customer_order_email(order_info, addr)
        _record_tax_transaction(order_info)


def _record_tax_transaction(order: dict) -> None:
    """Queue 'create Stripe Tax Transaction' job to S3. The non-VPC sibling
    Lambda actually calls stripe.tax.Transaction.create_from_calculation(),
    which is what makes Stripe Tax officially record this sale for state
    reporting. Without this, the Calculation we did at PI-creation time is
    just an estimate that never gets remitted in our Stripe Tax reports.
    Best-effort: never raises."""
    if not order.get('tax_calculation_id'):
        return
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        key = f"regen-queue/tax-tx-{order['order_number']}-{int(time.time() * 1000)}.json"
        s3.put_object(
            Bucket=NOTIFY_QUEUE_BUCKET,
            Key=key,
            Body=json.dumps({
                'action':              'create_tax_transaction',
                'tax_calculation_id':  order['tax_calculation_id'],
                'order_number':        order['order_number'],
                'order_id':            order.get('order_id'),
            }).encode('utf-8'),
            ContentType='application/json',
        )
        logger.info(f"Queued tax-transaction job for {order['order_number']} via {key}")
    except Exception as e:
        logger.error(f"_record_tax_transaction queueing failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER ORDER-CONFIRMATION EMAIL — queued via S3 to the non-VPC sibling
# Lambda (machx-bike-html-regen). We can't call Resend directly from inside
# the VPC. Stripe ALSO sends an automatic receipt (receipt_email on the PI),
# so this branded email is companion to that, not the safety net.
# Best-effort: never raises into the caller.
# ─────────────────────────────────────────────────────────────────────────────

def _send_customer_order_email(order: dict, addr: dict | None) -> None:
    """Queue the branded order-confirmation email. The non-VPC sibling Lambda
    picks up the S3 trigger and actually calls Resend."""
    try:
        # Slim down the order payload — bike_html_regen only needs these fields
        slim_order = {
            'order_number':   order.get('order_number'),
            'customer_name':  order.get('customer_name'),
            'customer_email': order.get('customer_email'),
            'total':          float(order.get('total') or 0),
        }
        slim_items = [
            {
                'bike_name': it.get('bike_name') or 'Bike',
                'quantity':  int(it.get('quantity', 1)),
            }
            for it in (order.get('items') or [])
        ]
        slim_addr = None
        if addr:
            slim_addr = {
                'line1': addr.get('line1', ''),
                'line2': addr.get('line2', ''),
                'city':  addr.get('city', ''),
                'state': addr.get('state', ''),
                'zip':   addr.get('zip', ''),
            }

        s3 = boto3.client('s3', region_name=AWS_REGION)
        key = f"regen-queue/email-order-{slim_order['order_number']}-{int(time.time() * 1000)}.json"
        s3.put_object(
            Bucket=NOTIFY_QUEUE_BUCKET,
            Key=key,
            Body=json.dumps({
                'action': 'send_order_confirmation_email',
                'order':  slim_order,
                'items':  slim_items,
                'addr':   slim_addr,
            }).encode('utf-8'),
            ContentType='application/json',
        )
        logger.info(f"Queued order-confirmation email for {slim_order['order_number']} via {key}")
    except Exception as e:
        logger.error(f"_send_customer_order_email queueing failed: {e}")


def _refund_race_loser(pi_id: str, ref: dict, secret_key: str):
    """Tertiary safety net. Refund a buyer whose payment succeeded but whose
    session lost the reservation race. `ref` is a dict with keys:
    {order_number, customer_email, customer_name, total} — pulled from the
    session (since no real order was materialized in the race-lost path)."""
    refund_ok = False
    refund_id = None
    refund_err = None

    try:
        import stripe
        stripe.api_key = secret_key
        refund = stripe.Refund.create(
            payment_intent=pi_id,
            reason='duplicate',
            metadata={'order_number': ref['order_number']},
            idempotency_key=f'race-refund-{pi_id}',
        )
        refund_id = refund.id
        refund_ok = True
        logger.info(f"Auto-refund issued: refund={refund_id} for race-lost session {ref['order_number']}")
    except Exception as e:
        refund_err = str(e)
        logger.error(f"Refund failed for race-lost session {ref['order_number']}: {e}")

    # Alert admin — they need to know whenever this happens
    if refund_ok:
        sms = (
            f"⚠️ RACE AUTO-REFUND: {ref['order_number']}\n"
            f"Bike was sold to another buyer in the same window.\n"
            f"💸 Refund: ${float(ref['total']):.2f} → {ref['customer_email']}\n"
            f"Stripe refund: {refund_id}"
        )
    else:
        sms = (
            f"🚨 CRITICAL: REFUND FAILED for {ref['order_number']}\n"
            f"Bike sold to another buyer + auto-refund failed.\n"
            f"💸 Manually refund ${float(ref['total']):.2f} via Stripe dashboard.\n"
            f"PI: {pi_id}\n"
            f"Error: {refund_err}"
        )
    _send_sms(sms)


def _handle_payment_failed(pi):
    pi_id   = pi['id']
    failure = (pi.get('last_payment_error') or {}).get('message', 'Payment failed')
    conn    = get_connection()
    conn.commit()

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, order_number FROM checkout_sessions WHERE stripe_payment_intent_id = %s",
                (pi_id,)
            )
            session = cur.fetchone()
            if not session:
                logger.warning(f"payment_intent.payment_failed: no session for PI {pi_id}")
                return

            session_id = session['id']

            # Release the reservation immediately — buyer's card declined.
            cur.execute(
                """
                UPDATE bikes
                SET reservation_state = 'none',
                    reserved_until = NULL,
                    reservation_session_id = NULL
                WHERE reservation_session_id = %s AND sold = 0
                """,
                (session_id,)
            )
            cur.execute(
                "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s AND status = 'active'",
                (session_id,)
            )

        conn.commit()
        logger.info(f"Session {session['order_number']} payment failed: {failure} — reservation released")

    except Exception:
        conn.rollback()
        raise


def _handle_payment_canceled(pi):
    """payment_intent.canceled — buyer abandoned, or we explicitly canceled
    from the processing handler. Either way, release the reservation."""
    pi_id = pi['id']
    conn  = get_connection()
    conn.commit()

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, order_number FROM checkout_sessions WHERE stripe_payment_intent_id = %s",
                (pi_id,)
            )
            session = cur.fetchone()
            if not session:
                logger.info(f"payment_intent.canceled: no session for PI {pi_id} (likely test event)")
                return

            session_id = session['id']

            cur.execute(
                """
                UPDATE bikes
                SET reservation_state = 'none',
                    reserved_until = NULL,
                    reservation_session_id = NULL
                WHERE reservation_session_id = %s AND sold = 0
                """,
                (session_id,)
            )
            cur.execute(
                "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s AND status = 'active'",
                (session_id,)
            )
        conn.commit()
        logger.info(f"Session {session['order_number']} canceled — reservation released")

    except Exception:
        conn.rollback()
        raise
