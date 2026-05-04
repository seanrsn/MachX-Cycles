"""
contact_api.py — MachX Cycles Contact Form API

Sends contact form submissions as SMS to the shop phone.
Runs OUTSIDE VPC for Twilio access.
"""
import json
import logging
import boto3
from twilio.rest import Client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

AWS_REGION = 'us-east-1'
TWILIO_SECRET_NAME = 'twilio-credentials'
SHOP_PHONE = '+17182184464'

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


def handler(event, context):
    method = event.get('httpMethod', 'POST').upper()
    
    # Handle CORS preflight
    if method == 'OPTIONS':
        return _response({})
    
    if method != 'POST':
        return _response({'error': 'Method not allowed'}, 405)
    
    # Parse body
    try:
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)
    except json.JSONDecodeError:
        return _response({'error': 'Invalid JSON'}, 400)
    
    name = (body.get('name') or '').strip()
    email = (body.get('email') or '').strip()
    subject = (body.get('subject') or 'Website Inquiry').strip()
    message = (body.get('message') or '').strip()
    
    if not name or not email or not message:
        return _response({'error': 'Name, email, and message are required'}, 400)
    
    # Build SMS message
    sms_body = f"📩 MachX Contact Form\n\nFrom: {name}\nEmail: {email}\nSubject: {subject}\n\n{message[:500]}"
    
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
