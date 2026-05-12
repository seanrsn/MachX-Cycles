#!/bin/bash
# deploy.sh — MachX Cycles Lambda deployment script
#
# Usage:
#   ./deploy.sh             # deploy all available functions
#   ./deploy.sh admin-api   # deploy a single function by name
#
# Prerequisites: AWS CLI configured, pip3 available

set -e

REGION="us-east-1"
DIST_DIR="$(pwd)/dist"
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$DIST_DIR"

# Map: Lambda function name -> source file in backend/functions/
# /checkout and /orders API routes hit stripe-payment (outside VPC for Stripe
# API access), which fans out to checkout-db (in VPC for RDS access).
declare -A FUNCTIONS=(
  ["admin-api"]="admin_api.py"
  ["bikes-public"]="bikes_public.py"
  ["stripe-payment"]="stripe_payment.py"
  ["checkout-db"]="checkout_db.py"
  ["stripe-webhook"]="stripe_webhook.py"
  ["machx-contact-api"]="contact_api.py"
  ["machx-bike-html-regen"]="bike_html_regen.py"  # non-VPC: regenerates per-bike HTML on admin actions via S3 trigger
)

deploy_lambda() {
  local NAME="$1"
  local FUNCTION_FILE="${FUNCTIONS[$NAME]}"
  local SRC="$BACKEND_DIR/functions/$FUNCTION_FILE"

  if [ -z "$FUNCTION_FILE" ]; then
    echo "⚠️  Unknown function: $NAME"
    return 1
  fi

  if [ ! -f "$SRC" ]; then
    echo "⏭️  Skipping $NAME — $FUNCTION_FILE not found (not yet implemented)"
    return 0
  fi

  echo ""
  echo "📦 Packaging $NAME ..."
  local BUILD_DIR
  BUILD_DIR=$(mktemp -d)

  # Copy shared utilities
  cp -r "$BACKEND_DIR/shared" "$BUILD_DIR/"

  # Copy the Lambda handler
  cp "$SRC" "$BUILD_DIR/"

  # Install dependencies
  pip3 install -r "$BACKEND_DIR/requirements.txt" -t "$BUILD_DIR" --quiet

  # Zip it up (exclude pyc files and caches)
  local ZIP="$DIST_DIR/${NAME}.zip"
  (cd "$BUILD_DIR" && zip -r "$ZIP" . \
    --exclude "*.pyc" \
    --exclude "__pycache__/*" \
    --exclude "*.dist-info/*" \
    > /dev/null)

  echo "   Zip: $ZIP ($(du -sh "$ZIP" | cut -f1))"

  # Deploy to Lambda
  echo "   Deploying to Lambda function: $NAME ..."
  aws lambda update-function-code \
    --function-name "$NAME" \
    --zip-file "fileb://$ZIP" \
    --region "$REGION" \
    --output text \
    --query 'CodeSize' | xargs -I{} echo "   Code size: {} bytes"

  # Clean up build dir
  rm -rf "$BUILD_DIR"
  echo "✅ $NAME deployed"
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo "🚴 MachX Cycles — Lambda Deployment"
echo "Region: $REGION"
echo "Dist:   $DIST_DIR"

if [ -n "$1" ]; then
  # Deploy single function
  deploy_lambda "$1"
else
  # Deploy all
  for NAME in "${!FUNCTIONS[@]}"; do
    deploy_lambda "$NAME"
  done
fi

echo ""
echo "🎉 Done!"
