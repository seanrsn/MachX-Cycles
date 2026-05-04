"""
config.py — MachX Cycles environment configuration

All environment variables with sensible defaults.
Lambda functions import from here instead of calling os.environ directly.
"""
import os

# ── Database ──────────────────────────────────────────────────────────────────
DB_SECRET_NAME = os.environ.get('DB_SECRET_NAME', 'machx-db-credentials')
DB_HOST        = os.environ.get('DB_HOST', 'brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com')
DB_NAME        = os.environ.get('DB_NAME', 'machx_cycles')

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_NAME = os.environ.get('STRIPE_SECRET_NAME', 'machx-stripe-keys')

# ── S3 / CDN ──────────────────────────────────────────────────────────────────
IMAGES_BUCKET   = os.environ.get('IMAGES_BUCKET',   'machx-cycles-images')
IMAGES_CDN_BASE = os.environ.get('IMAGES_CDN_BASE', 'https://images.machxcycles.com')

# ── Cognito (admin auth) ──────────────────────────────────────────────────────
COGNITO_USER_POOL_ID  = os.environ.get('COGNITO_USER_POOL_ID',  '')
COGNITO_APP_CLIENT_ID = os.environ.get('COGNITO_APP_CLIENT_ID', '')

# ── AWS ───────────────────────────────────────────────────────────────────────
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# ── Business logic defaults ───────────────────────────────────────────────────
TAX_RATE                    = float(os.environ.get('TAX_RATE',                    '8.875'))
RESERVATION_FEE_PERCENTAGE  = float(os.environ.get('RESERVATION_FEE_PERCENTAGE',  '10'))
PRESIGNED_URL_EXPIRY_SECONDS = int(os.environ.get('PRESIGNED_URL_EXPIRY_SECONDS', '300'))
