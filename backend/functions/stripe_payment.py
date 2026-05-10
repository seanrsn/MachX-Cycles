"""
stripe_payment.py — MachX Cycles Checkout API (Entry Point)

Runs OUTSIDE VPC for Stripe API access.
Invokes checkout-db Lambda (in VPC) for database operations.

Flow:
1. Receive checkout request from frontend
2. Invoke checkout-db to create order in RDS
3. Create Stripe PaymentIntent
4. Update order with PaymentIntent ID
5. Return client_secret to frontend
"""
import json
import logging
import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

AWS_REGION = 'us-east-1'
STRIPE_SECRET_NAME = 'machx-stripe-keys'
CHECKOUT_DB_LAMBDA = 'checkout-db'

_stripe = None


def _get_stripe():
    global _stripe
    if _stripe is not None:
        return _stripe
    
    import stripe
    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    resp = client.get_secret_value(SecretId=STRIPE_SECRET_NAME)
    keys = json.loads(resp['SecretString'])
    stripe.api_key = keys.get('secret_key', '')
    _stripe = stripe
    return _stripe


def _invoke_checkout_db(payload):
    """Invoke checkout-db Lambda and return result."""
    client = boto3.client('lambda', region_name=AWS_REGION)
    response = client.invoke(
        FunctionName=CHECKOUT_DB_LAMBDA,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload),
    )
    return json.loads(response['Payload'].read().decode('utf-8'))


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


def _error(message, status=400):
    return _response({'error': message}, status)


def handler(event, context):
    """API Gateway entry point for checkout."""
    method = event.get('httpMethod', 'POST').upper()
    path = event.get('path', '/checkout').rstrip('/')
    
    # Handle CORS preflight
    if method == 'OPTIONS':
        return _response({})
    
    # Route: POST /checkout
    if path == '/checkout' and method == 'POST':
        return handle_checkout(event)
    
    # Route: GET /orders (lookup)
    if path == '/orders' and method == 'GET':
        return handle_order_lookup(event)
    
    return _error('Not found', 404)


def handle_checkout(event):
    """Create order and Stripe PaymentIntent."""
    
    # Parse request body
    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)
    except json.JSONDecodeError:
        return _error('Invalid JSON body')
    
    # Step 1: Create checkout session in database via checkout-db Lambda.
    # This does NOT create a real `orders` row — that happens only after
    # payment_intent.succeeded fires (in stripe-webhook).
    db_payload = {
        'action': 'create_session',
        'customer_name': body.get('customer_name'),
        'customer_email': body.get('customer_email'),
        'customer_phone': body.get('customer_phone'),
        'shipping_address': body.get('shipping_address'),
        'shipping_rate_id': body.get('shipping_rate_id'),
        'items': body.get('items'),
        'promo_code': body.get('promo_code'),
        'buyer_token': body.get('buyer_token'),
    }

    logger.info(f"Creating checkout session for {body.get('customer_email')}")
    db_result = _invoke_checkout_db(db_payload)
    
    if 'error' in db_result:
        logger.error(f"checkout-db error: {db_result['error']}")
        # Determine appropriate status code
        err = db_result['error'].lower()
        if (
            'insufficient stock' in err
            or 'already sold' in err
            or 'currently in another shopper' in err
            or 'just reserved' in err
        ):
            return _error(db_result['error'], 409)
        elif 'required' in err or 'invalid' in err:
            return _error(db_result['error'], 400)
        else:
            return _error(db_result['error'], 500)
    
    session_id   = db_result['session_id']
    order_number = db_result['order_number']
    total        = db_result['total']

    logger.info(f"Session {session_id} created (order_number={order_number}), total: ${total}")

    # Step 2: Create Stripe PaymentIntent
    client_secret = None
    try:
        stripe = _get_stripe()

        pi = stripe.PaymentIntent.create(
            amount=int(float(total) * 100),  # cents
            currency='usd',
            automatic_payment_methods={'enabled': True},
            metadata={
                'session_id':     str(session_id),
                'order_number':   order_number,
                'customer_email': body.get('customer_email', ''),
            },
            description=f'MachX Cycles – {order_number}',
        )

        client_secret = pi.client_secret
        logger.info(f"PaymentIntent {pi.id} created for session {session_id}")

        # Step 3: Store PI id on the session + extend reservation to 10 min
        update_result = _invoke_checkout_db({
            'action': 'update_session_pi',
            'session_id': session_id,
            'payment_intent_id': pi.id,
        })

        if 'error' in update_result:
            logger.warning(f"Failed to store PI id: {update_result['error']}")
            # Continue anyway — session exists, payment can still proceed

    except Exception as e:
        logger.exception(f"Stripe error for session {session_id}")
        return _error('Payment initialization failed. Please try again.', 500)

    # Step 4: Return client_secret. Note: order_id intentionally not returned
    # because no real order exists yet — only a session. Frontend uses the
    # order_number for confirmation page lookups.
    return _response({
        'session_id':    session_id,
        'order_number':  order_number,
        'total':         total,
        'client_secret': client_secret,
    }, 201)


def handle_order_lookup(event):
    """Look up order status by email and order number."""
    params = event.get('queryStringParameters') or {}
    
    result = _invoke_checkout_db({
        'action': 'lookup_order',
        'email': params.get('email'),
        'order_number': params.get('order_number'),
    })
    
    if 'error' in result:
        status = 404 if 'not found' in result['error'].lower() else 400
        return _error(result['error'], status)
    
    return _response(result)
