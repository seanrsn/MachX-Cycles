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
NOTIFY_PHONE = os.environ.get('NOTIFY_PHONE', '+17182184464')


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
        return error(f'Webhook error: {e}', status=400)

    event_type = evt['type']
    pi         = evt['data']['object']
    logger.info(f"Stripe event: {event_type} | PI: {pi.get('id')}")

    if event_type == 'payment_intent.succeeded':
        _handle_payment_succeeded(pi)
    elif event_type == 'payment_intent.payment_failed':
        _handle_payment_failed(pi)
    else:
        logger.info(f"Unhandled event type (ignored): {event_type}")

    return success({'received': True})


# ── Event handlers ────────────────────────────────────────────────────────────

def _handle_payment_succeeded(pi):
    pi_id = pi['id']
    conn  = get_connection()
    conn.commit()

    order_info = None

    try:
        with conn.cursor() as cur:
            # Get full order details for notification
            cur.execute(
                """
                SELECT o.id, o.order_number, o.customer_name, o.customer_email,
                       o.customer_phone, o.total, o.shipping_address
                FROM orders o
                WHERE o.stripe_payment_intent_id = %s
                """,
                (pi_id,)
            )
            order = cur.fetchone()
            if not order:
                logger.warning(f"payment_intent.succeeded: no order for PI {pi_id}")
                return

            # Get order items
            cur.execute(
                """
                SELECT b.name AS bike_name, oi.quantity, oi.frame_size, oi.color
                FROM order_items oi
                JOIN bikes b ON b.id = oi.bike_id
                WHERE oi.order_id = %s
                """,
                (order['id'],)
            )
            items = cur.fetchall()

            # Update order status
            cur.execute(
                """
                UPDATE orders
                SET payment_status = 'paid',
                    status = 'confirmed',
                    stripe_latest_charge_id = %s
                WHERE id = %s
                """,
                (pi.get('latest_charge'), order['id'])
            )
            
            # Mark bike as sold
            cur.execute(
                "UPDATE bikes SET sold = TRUE WHERE id = (SELECT bike_id FROM order_items WHERE order_id = %s LIMIT 1)",
                (order['id'],)
            )

            cur.execute(
                """
                INSERT INTO order_events (order_id, event_type, message, metadata)
                VALUES (%s, 'payment_intent.succeeded', 'Payment confirmed — order is processing', %s)
                """,
                (order['id'], json.dumps({'payment_intent_id': pi_id}))
            )

            order_info = {
                'order_number': order['order_number'],
                'customer_name': order['customer_name'],
                'customer_email': order['customer_email'],
                'customer_phone': order['customer_phone'],
                'total': float(order['total']),
                'items': items,
                'shipping_address': order['shipping_address'],
            }

        conn.commit()
        logger.info(f"Order {order['order_number']} marked paid / confirmed")

    except Exception:
        conn.rollback()
        raise

    # Send SMS notification (after DB commit)
    if order_info:
        items_text = ", ".join([
            f"{i['bike_name']} ({i['frame_size']}/{i['color']}) x{i['quantity']}"
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


def _handle_payment_failed(pi):
    pi_id   = pi['id']
    failure = (pi.get('last_payment_error') or {}).get('message', 'Payment failed')
    conn    = get_connection()
    conn.commit()

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, order_number FROM orders WHERE stripe_payment_intent_id = %s",
                (pi_id,)
            )
            order = cur.fetchone()
            if not order:
                logger.warning(f"payment_intent.payment_failed: no order for PI {pi_id}")
                return

            cur.execute(
                "UPDATE orders SET payment_status = 'unpaid', status = 'pending' WHERE id = %s",
                (order['id'],)
            )
            cur.execute(
                """
                INSERT INTO order_events (order_id, event_type, message, metadata)
                VALUES (%s, 'payment_intent.payment_failed', %s, %s)
                """,
                (order['id'], failure, json.dumps({'payment_intent_id': pi_id}))
            )
        conn.commit()
        logger.info(f"Order {order['order_number']} payment failed: {failure}")

    except Exception:
        conn.rollback()
        raise
