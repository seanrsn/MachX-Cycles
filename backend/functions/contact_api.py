"""
contact_api.py — MachX Cycles Contact Form API

Sends contact form submissions as SMS to the shop phone.
Runs OUTSIDE VPC for Twilio access.

Defenses:
- Field length caps (no 10MB blobs)
- Honeypot field rejects bot fills
- Per-email + per-IP soft rate limit (in-memory; resets on cold start)
- Generic error responses (no exception strings to client)
"""
import json
import logging
import re
import time
import boto3
from twilio.rest import Client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

AWS_REGION = 'us-east-1'
TWILIO_SECRET_NAME = 'twilio-credentials'
SHOP_PHONE = '+17182184464'

# Field length caps (chars). Prevents memory blow-up + SMS-cost amplification.
MAX_NAME = 200
MAX_EMAIL = 254       # RFC 5321
MAX_SUBJECT = 200
MAX_MESSAGE = 2000

# Soft in-memory throttle. Resets on cold start; not bulletproof but blocks
# trivial floods. Pair with API Gateway throttling for the real defense.
_RECENT = {}  # key -> [timestamps]
_RECENT_WINDOW_S = 600   # 10 min
_RECENT_MAX = 3          # max 3 submissions per (key) per window

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_twilio_client = None


def _get_twilio():
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client

    sm = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp = sm.get_secret_value(SecretId=TWILIO_SECRET_NAME)
    creds = json.loads(resp['SecretString'])

    _twilio_client = {
        'client': Client(creds['account_sid'], creds['auth_token']),
        'from_phone': creds['from_number'],
    }
    return _twilio_client


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Content-Type': 'application/json',
    }


def _response(body, status=200):
    return {
        'statusCode': status,
        'headers': _cors_headers(),
        'body': json.dumps(body, default=str),
    }


def _too_many(key):
    """Return True if `key` has hit the recent-submission cap."""
    now = time.time()
    bucket = [t for t in _RECENT.get(key, []) if now - t < _RECENT_WINDOW_S]
    if len(bucket) >= _RECENT_MAX:
        _RECENT[key] = bucket  # trim
        return True
    bucket.append(now)
    _RECENT[key] = bucket
    return False


def handler(event, context):
    method = event.get('httpMethod', 'POST').upper()

    # Handle CORS preflight
    if method == 'OPTIONS':
        return _response({})

    if method != 'POST':
        return _response({'error': 'Method not allowed'}, 405)

    # Parse body (cap raw size to ~10KB before parse)
    raw = event.get('body') or '{}'
    if isinstance(raw, str) and len(raw) > 10_000:
        return _response({'error': 'Payload too large'}, 413)
    try:
        body = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return _response({'error': 'Invalid JSON'}, 400)

    # Honeypot — real users don't see/fill these. If anything's in `_hp` /
    # `website` / `phone_alt`, silently 200 to waste the bot's time.
    if any((body.get(f) or '').strip() for f in ('_hp', 'website', 'phone_alt')):
        logger.info("Contact: honeypot tripped, dropping silently")
        return _response({'success': True, 'message': 'Message sent successfully!'})

    name = (body.get('name') or '').strip()[:MAX_NAME]
    email = (body.get('email') or '').strip()[:MAX_EMAIL]
    subject = (body.get('subject') or 'Website Inquiry').strip()[:MAX_SUBJECT]
    message = (body.get('message') or '').strip()[:MAX_MESSAGE]

    if not name or not email or not message:
        return _response({'error': 'Name, email, and message are required'}, 400)

    if not EMAIL_RE.match(email):
        return _response({'error': 'Please provide a valid email address'}, 400)

    # Soft throttle by email + by source IP
    src_ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp') \
             or (event.get('requestContext') or {}).get('http', {}).get('sourceIp') \
             or 'unknown'
    if _too_many(f"email:{email.lower()}") or _too_many(f"ip:{src_ip}"):
        logger.info(f"Contact: rate-limited (email={email}, ip={src_ip})")
        # Don't tell scrapers exactly why — generic 429
        return _response({'error': 'Please wait a few minutes and try again.'}, 429)

    # Strip newlines from headers to prevent SMS template injection
    clean_name = name.replace('\n', ' ').replace('\r', ' ')
    clean_email = email.replace('\n', '').replace('\r', '')
    clean_subject = subject.replace('\n', ' ').replace('\r', ' ')

    sms_body = f"MachX Contact Form\n\nFrom: {clean_name}\nEmail: {clean_email}\nSubject: {clean_subject}\n\n{message}"

    try:
        twilio = _get_twilio()
        twilio['client'].messages.create(
            body=sms_body,
            from_=twilio['from_phone'],
            to=SHOP_PHONE,
        )
        logger.info(f"Contact SMS sent from {email}")
        return _response({'success': True, 'message': 'Message sent successfully!'})

    except Exception as e:
        logger.error(f"Failed to send contact SMS: {e}")
        return _response({'error': 'Failed to send message. Please try again.'}, 500)
