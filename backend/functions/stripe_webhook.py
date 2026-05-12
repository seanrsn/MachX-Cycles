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
import urllib.request
import urllib.error
from html import escape as html_escape

import boto3

from shared.config import STRIPE_SECRET_NAME, AWS_REGION
from shared.db import get_connection
from shared.response import success, error

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Secrets (lazy-loaded) ─────────────────────────────────────────────────────
_stripe_keys = None
_twilio_creds = None

# Phone number to notify on new orders (can also be env var)
NOTIFY_PHONE = os.environ.get('NOTIFY_PHONE', '+19177530685')


def _get_stripe_keys():
    global _stripe_keys
    if _stripe_keys is not None:
        return _stripe_keys
    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp   = client.get_secret_value(SecretId=STRIPE_SECRET_NAME)
    _stripe_keys = json.loads(resp['SecretString'])
    return _stripe_keys


def _get_twilio_creds():
    global _twilio_creds
    if _twilio_creds is not None:
        return _twilio_creds
    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp   = client.get_secret_value(SecretId='twilio-credentials')
    _twilio_creds = json.loads(resp['SecretString'])
    return _twilio_creds


def _send_sms(message: str):
    """Send SMS via Twilio."""
    try:
        creds = _get_twilio_creds()
        account_sid = creds.get('account_sid')
        auth_token  = creds.get('auth_token')
        from_number = creds.get('from_number')

        if not all([account_sid, auth_token, from_number]):
            logger.warning("Twilio credentials incomplete — skipping SMS")
            return

        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        
        client.messages.create(
            body=message,
            from_=from_number,
            to=NOTIFY_PHONE
        )
        logger.info(f"SMS sent to {NOTIFY_PHONE}")

    except Exception as e:
        logger.error(f"Failed to send SMS: {e}")
        # Don't raise — SMS failure shouldn't break the webhook


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
                       subtotal, discount_amount, total, promo_code, items, status,
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
                         shipping_address, shipping_fee, subtotal, discount_amount, total,
                         stripe_payment_intent_id, stripe_latest_charge_id,
                         payment_status, status, notes)
                    VALUES (%s, %s, %s, %s, 'ship', 'full',
                            %s, %s, %s, %s, %s,
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
                        session['total'],
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
                    VALUES (%s, 'created', 'Order materialized from checkout session on payment success', %s)
                    """,
                    (order_id, json.dumps({'session_id': session_id, 'payment_intent_id': pi_id}))
                )
                cur.execute(
                    """
                    INSERT INTO order_events (order_id, event_type, message, metadata)
                    VALUES (%s, 'payment_intent.succeeded', 'Payment confirmed — order is processing', %s)
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
                    'order_number':     order_number,
                    'customer_name':    session['customer_name'],
                    'customer_email':   session['customer_email'],
                    'customer_phone':   session['customer_phone'],
                    'total':            float(session['total']),
                    'items':            [
                        {
                            'bike_name': it.get('bike_name', f"Bike #{it.get('bike_id')}"),
                            'quantity':  it.get('quantity', 1),
                        }
                        for it in items
                    ],
                    'shipping_address': session['shipping_address'],
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


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER EMAIL (via Resend) — sends a branded order-confirmation email.
# Stripe ALSO sends a receipt automatically (we set receipt_email on the PI),
# so this is the on-brand companion email with delivery info + tracking link.
# Best-effort: never raises into the caller. Webhook returns 200 even if
# email send fails — Stripe receipt is the safety net.
# ─────────────────────────────────────────────────────────────────────────────

_RESEND_KEY  = None
_RESEND_FROM = 'MachX Cycles <hello@machxcycles.com>'

def _resend_creds():
    """Pull the Resend API key from Secrets Manager once per warm Lambda."""
    global _RESEND_KEY
    if _RESEND_KEY is None:
        try:
            sm = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
            resp = sm.get_secret_value(SecretId='machx-resend-key')
            _RESEND_KEY = json.loads(resp['SecretString'])['api_key']
        except Exception as e:
            logger.error(f"_resend_creds: failed to fetch key: {e}")
            return None
    return _RESEND_KEY


def _send_customer_order_email(order: dict, addr: dict | None) -> None:
    """Send the order-confirmation email to the customer. Best-effort."""
    try:
        api_key = _resend_creds()
        if not api_key:
            logger.warning("_send_customer_order_email: no Resend key, skipping")
            return

        to_email = (order.get('customer_email') or '').strip()
        if not to_email:
            logger.info("_send_customer_order_email: no customer_email, skipping")
            return

        order_number = order['order_number']
        total        = float(order['total'])
        customer     = order.get('customer_name') or 'there'
        items        = order.get('items') or []

        # HTML body — keep simple, mobile-friendly, single-column.
        items_html = ''.join(
            f'<li style="margin:6px 0;">{html_escape(it["bike_name"])}'
            + (f' &times; {it["quantity"]}' if it.get("quantity", 1) > 1 else '')
            + '</li>'
            for it in items
        )
        addr_html = ''
        if addr:
            line2 = addr.get('line2') or ''
            addr_html = (
                f'<p style="margin:0;color:#374151;">{html_escape(addr.get("line1", ""))}<br>'
                + (f'{html_escape(line2)}<br>' if line2 else '')
                + f'{html_escape(addr.get("city", ""))}, {html_escape(addr.get("state", ""))} {html_escape(addr.get("zip", ""))}</p>'
            )

        track_url = f'https://machxcycles.com/track-order'

        html_body = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="background:linear-gradient(135deg,#ec4899 0%,#f97316 100%);padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.01em;">MachX Cycles</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111827;">Thanks for your order, {html_escape(customer.split()[0] if customer else 'there')}!</h2>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:14px;">We've received your payment and your bike is being prepped.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin:0 0 20px 0;">
            <tr><td>
              <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Order number</p>
              <p style="margin:4px 0 12px 0;color:#111827;font-size:18px;font-weight:700;font-family:'SF Mono',Menlo,monospace;">{order_number}</p>
              <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Total</p>
              <p style="margin:4px 0 0 0;color:#111827;font-size:18px;font-weight:700;">${total:.2f}</p>
            </td></tr>
          </table>
          {('<h3 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Items</h3><ul style="margin:0 0 20px 0;padding-left:20px;color:#374151;font-size:15px;">' + items_html + '</ul>') if items_html else ''}
          {('<h3 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Ships to</h3>' + addr_html) if addr_html else ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 16px 0;">
            <tr><td align="center">
              <a href="{track_url}" style="display:inline-block;background:linear-gradient(135deg,#ec4899 0%,#f97316 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Track your order &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0 0;color:#6b7280;font-size:13px;line-height:1.5;">Use your email and order number <strong style="color:#111827;font-family:'SF Mono',Menlo,monospace;">{order_number}</strong> at <a href="{track_url}" style="color:#ec4899;text-decoration:none;">machxcycles.com/track-order</a> to check status anytime.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Just reply to this email — we'll get back to you within a day.</p>
          <p style="margin:8px 0 0 0;color:#9ca3af;font-size:12px;">MachX Cycles &middot; Brooklyn Bikery &middot; 3149 Emmons Ave, Brooklyn, NY 11235</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""

        # Plain-text fallback for clients that block HTML
        addr_text = ''
        if addr:
            addr_text = f"\n\nShips to:\n{addr.get('line1', '')}\n"
            if addr.get('line2'):
                addr_text += f"{addr['line2']}\n"
            addr_text += f"{addr.get('city', '')}, {addr.get('state', '')} {addr.get('zip', '')}"
        items_text = '\n'.join(
            f"  - {it['bike_name']}" + (f" x{it['quantity']}" if it.get('quantity', 1) > 1 else '')
            for it in items
        ) or '  (no items)'
        text_body = (
            f"Thanks for your order, {customer.split()[0] if customer else 'there'}!\n\n"
            f"Order number: {order_number}\n"
            f"Total: ${total:.2f}\n\n"
            f"Items:\n{items_text}"
            f"{addr_text}\n\n"
            f"Track at: {track_url} (use your email + order number)\n\n"
            f"Questions? Reply to this email.\n\n"
            f"— MachX Cycles\n"
            f"3149 Emmons Ave, Brooklyn, NY 11235"
        )

        payload = json.dumps({
            'from':    _RESEND_FROM,
            'to':      [to_email],
            # Subject uses ASCII hyphen (not em-dash) so headers stay 7-bit
            # clean and don't need MIME-encoding. Body is UTF-8 and fine.
            'subject': f'Order confirmed - {order_number}',
            'html':    html_body,
            'text':    text_body,
            'reply_to': 'hello@machxcycles.com',
            'headers': {
                # Helps recipients' mail clients thread future order updates
                'X-Entity-Ref-ID': order_number,
            },
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.resend.com/emails',
            data=payload,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type':  'application/json',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read().decode('utf-8')
            logger.info(f"Resend OK for order {order_number}: {body[:200]}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='ignore')[:300]
            logger.error(f"Resend HTTP {e.code} for order {order_number}: {err_body}")
        except Exception as e:
            logger.error(f"Resend send failed for order {order_number}: {e}")
    except Exception as e:
        # Belt-and-suspenders: never let an email-send error kill the webhook
        logger.error(f"_send_customer_order_email crashed: {e}")


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
