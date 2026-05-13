"""
response.py — MachX Cycles API Gateway response builder

Centralises CORS headers, JSON serialisation, and error formatting
so every Lambda returns consistent responses.

Usage:
    from shared.response import success, error, handle_options, parse_body

    def lambda_handler(event, context):
        if event['httpMethod'] == 'OPTIONS':
            return handle_options()

        body = parse_body(event)
        if not body.get('name'):
            return error('name is required', status=400)

        return success({'id': 1, 'name': body['name']}, status=201)
"""
import json
import logging
from decimal import Decimal
from datetime import datetime, date

logger = logging.getLogger(__name__)

# ── CORS headers (included on every response) ─────────────────────────────────
CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Content-Type':                 'application/json',
}


# ── Custom JSON encoder ───────────────────────────────────────────────────────
class _Encoder(json.JSONEncoder):
    """Handle types that the default encoder can't serialise."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            # MySQL returns naive datetimes; we always store UTC. Tag them
            # with 'Z' so JS Date parses them as UTC and renders in the
            # user's local timezone — without 'Z', browsers treat the
            # string as local time and display a 4–8 hour offset.
            if obj.tzinfo is None:
                return obj.isoformat() + 'Z'
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)


def _dumps(data) -> str:
    return json.dumps(data, cls=_Encoder)


# ── Public helpers ────────────────────────────────────────────────────────────

def success(data, status: int = 200) -> dict:
    """Return a 2xx API Gateway response."""
    return {
        'statusCode': status,
        'headers':    CORS_HEADERS,
        'body':       _dumps(data),
    }


def error(message: str, status: int = 400, details=None) -> dict:
    """Return a 4xx/5xx API Gateway response."""
    body = {'error': message}
    if details is not None:
        body['details'] = details
    return {
        'statusCode': status,
        'headers':    CORS_HEADERS,
        'body':       _dumps(body),
    }


def handle_options() -> dict:
    """Return 200 for CORS preflight OPTIONS requests."""
    return {
        'statusCode': 200,
        'headers':    CORS_HEADERS,
        'body':       '',
    }


def parse_body(event: dict) -> dict:
    """
    Safely parse the JSON request body from an API Gateway event.
    Returns an empty dict if the body is absent or not valid JSON.
    """
    raw = event.get('body') or ''
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse request body: %r", raw[:200])
        return {}


def get_path_params(event: dict) -> dict:
    """Return pathParameters dict, defaulting to empty dict."""
    return event.get('pathParameters') or {}


def get_query_params(event: dict) -> dict:
    """Return queryStringParameters dict, defaulting to empty dict."""
    return event.get('queryStringParameters') or {}
