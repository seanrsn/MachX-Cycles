#!/bin/bash
# setup.sh — MachX Cycles AWS Infrastructure Setup
#
# Run this ONCE to create all Phase 1 AWS resources.
# Prerequisites: AWS CLI v2 configured with admin credentials, jq installed.
#
# Usage: ./infrastructure/setup.sh

set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
RDS_HOST="brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com"

echo ""
echo "🚴 MachX Cycles — AWS Infrastructure Setup"
echo "Account: $ACCOUNT_ID | Region: $REGION"
echo "========================================================"

# ─────────────────────────────────────────────────────────────
# 1. S3 — Images bucket
# ─────────────────────────────────────────────────────────────
echo ""
echo "📦 [1/6] Creating S3 buckets ..."

# Images bucket
if aws s3 ls "s3://machx-cycles-images" 2>/dev/null; then
  echo "   machx-cycles-images already exists — skipping"
else
  aws s3 mb "s3://machx-cycles-images" --region "$REGION"
  echo "   Created machx-cycles-images"
fi

# Disable public access block so presigned PUTs and public GETs work
aws s3api put-public-access-block \
  --bucket machx-cycles-images \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# CORS — allow browser uploads via presigned URLs and CloudFront reads
aws s3api put-bucket-cors \
  --bucket machx-cycles-images \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders":  ["ETag"],
      "MaxAgeSeconds":  3600
    }]
  }'

# Public read bucket policy (images are served publicly via CloudFront)
aws s3api put-bucket-policy \
  --bucket machx-cycles-images \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\":       \"PublicReadGetObject\",
      \"Effect\":    \"Allow\",
      \"Principal\": \"*\",
      \"Action\":    \"s3:GetObject\",
      \"Resource\":  \"arn:aws:s3:::machx-cycles-images/*\"
    }]
  }"

echo "   machx-cycles-images: CORS + public read configured"

# Frontend bucket
if aws s3 ls "s3://machx-cycles-frontend" 2>/dev/null; then
  echo "   machx-cycles-frontend already exists — skipping"
else
  aws s3 mb "s3://machx-cycles-frontend" --region "$REGION"
  echo "   Created machx-cycles-frontend"
fi

aws s3api put-public-access-block \
  --bucket machx-cycles-frontend \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

aws s3 website "s3://machx-cycles-frontend" \
  --index-document index.html \
  --error-document index.html   # SPA: serve index.html for all 404s

aws s3api put-bucket-policy \
  --bucket machx-cycles-frontend \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\":       \"PublicReadGetObject\",
      \"Effect\":    \"Allow\",
      \"Principal\": \"*\",
      \"Action\":    \"s3:GetObject\",
      \"Resource\":  \"arn:aws:s3:::machx-cycles-frontend/*\"
    }]
  }"

echo "   machx-cycles-frontend: static website hosting enabled"


# ─────────────────────────────────────────────────────────────
# 2. Secrets Manager
# ─────────────────────────────────────────────────────────────
echo ""
echo "🔑 [2/6] Creating Secrets Manager secrets ..."

create_secret() {
  local NAME="$1"
  local VALUE="$2"
  local DESC="$3"
  if aws secretsmanager describe-secret --secret-id "$NAME" --region "$REGION" 2>/dev/null; then
    echo "   $NAME already exists — skipping"
  else
    aws secretsmanager create-secret \
      --name "$NAME" \
      --description "$DESC" \
      --secret-string "$VALUE" \
      --region "$REGION" \
      --output text --query Name
    echo "   Created: $NAME"
  fi
}

create_secret \
  "machx-db-credentials" \
  "{\"host\":\"$RDS_HOST\",\"port\":3306,\"username\":\"REPLACE_ME\",\"password\":\"REPLACE_ME\",\"dbname\":\"machx_cycles\"}" \
  "MachX Cycles RDS MySQL credentials"

create_secret \
  "machx-stripe-keys" \
  "{\"secret_key\":\"sk_test_REPLACE_ME\",\"webhook_secret\":\"whsec_REPLACE_ME\",\"publishable_key\":\"pk_test_REPLACE_ME\"}" \
  "MachX Cycles Stripe API keys"

echo "   ⚠️  Remember to update both secrets with real credentials!"


# ─────────────────────────────────────────────────────────────
# 3. Cognito User Pool (admin auth)
# ─────────────────────────────────────────────────────────────
echo ""
echo "🔐 [3/6] Creating Cognito User Pool ..."

POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" \
  --query "UserPools[?Name=='machx-cycles-admins'].Id" \
  --output text)

if [ -n "$POOL_ID" ]; then
  echo "   User pool already exists: $POOL_ID"
else
  POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "machx-cycles-admins" \
    --region "$REGION" \
    --policies '{
      "PasswordPolicy": {
        "MinimumLength": 12,
        "RequireUppercase": true,
        "RequireLowercase": true,
        "RequireNumbers": true,
        "RequireSymbols": true
      }
    }' \
    --admin-create-user-config '{
      "AllowAdminCreateUserOnly": true,
      "UnusedAccountValidityDays": 7
    }' \
    --auto-verified-attributes email \
    --username-attributes email \
    --query 'UserPool.Id' \
    --output text)
  echo "   Created User Pool: $POOL_ID"
fi

# App client (no client secret — for SPA use)
CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
  --user-pool-id "$POOL_ID" \
  --region "$REGION" \
  --query "UserPoolClients[?ClientName=='machx-cycles-admin-app'].ClientId" \
  --output text)

if [ -n "$CLIENT_ID" ]; then
  echo "   App client already exists: $CLIENT_ID"
else
  CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name "machx-cycles-admin-app" \
    --region "$REGION" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --query 'UserPoolClient.ClientId' \
    --output text)
  echo "   Created App Client: $CLIENT_ID"
fi

echo ""
echo "   ──────────────────────────────────────"
echo "   Cognito User Pool ID : $POOL_ID"
echo "   Cognito App Client ID: $CLIENT_ID"
echo "   ──────────────────────────────────────"
echo "   Save these — you'll need them for Lambda env vars and the frontend."


# ─────────────────────────────────────────────────────────────
# 4. IAM Role for Lambda
# ─────────────────────────────────────────────────────────────
echo ""
echo "🛡️  [4/6] Creating Lambda IAM role ..."

ROLE_NAME="machx-cycles-lambda-role"

if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "   Role $ROLE_NAME already exists — skipping"
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)
else
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect":    "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action":    "sts:AssumeRole"
      }]
    }' \
    --query Role.Arn \
    --output text)
  echo "   Created role: $ROLE_ARN"
fi

# Attach managed policy for basic Lambda execution (CloudWatch Logs)
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  2>/dev/null || true

# Inline policy: Secrets Manager, S3, VPC (for RDS access)
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "machx-cycles-lambda-policy" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\":    \"SecretsManager\",
        \"Effect\": \"Allow\",
        \"Action\": [\"secretsmanager:GetSecretValue\"],
        \"Resource\": [
          \"arn:aws:secretsmanager:$REGION:$ACCOUNT_ID:secret:machx-*\"
        ]
      },
      {
        \"Sid\":    \"S3Images\",
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\"],
        \"Resource\": \"arn:aws:s3:::machx-cycles-images/*\"
      },
      {
        \"Sid\":    \"S3Presign\",
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:ListBucket\"],
        \"Resource\": \"arn:aws:s3:::machx-cycles-images\"
      }
    ]
  }"

echo "   IAM role configured: $ROLE_ARN"


# ─────────────────────────────────────────────────────────────
# 5. Lambda Functions (placeholder — real code deployed via deploy.sh)
# ─────────────────────────────────────────────────────────────
echo ""
echo "⚡ [5/6] Creating Lambda functions ..."

# Create a minimal placeholder zip for initial creation
PLACEHOLDER_DIR=$(mktemp -d)
cat > "$PLACEHOLDER_DIR/lambda_function.py" << 'EOF'
def lambda_handler(event, context):
    return {"statusCode": 200, "body": "Placeholder — deploy real code with deploy.sh"}
EOF
(cd "$PLACEHOLDER_DIR" && zip placeholder.zip lambda_function.py > /dev/null)
PLACEHOLDER_ZIP="$PLACEHOLDER_DIR/placeholder.zip"

# Wait for IAM role to propagate
echo "   Waiting 10s for IAM role to propagate ..."
sleep 10

COMMON_ENV="Variables={DB_SECRET_NAME=machx-db-credentials,DB_HOST=$RDS_HOST,IMAGES_BUCKET=machx-cycles-images,IMAGES_CDN_BASE=https://images.machxcycles.com,COGNITO_USER_POOL_ID=$POOL_ID,AWS_REGION=$REGION}"

create_lambda() {
  local FNAME="$1"
  if aws lambda get-function --function-name "$FNAME" --region "$REGION" 2>/dev/null; then
    echo "   $FNAME already exists — skipping"
  else
    aws lambda create-function \
      --function-name "$FNAME" \
      --runtime python3.12 \
      --role "$ROLE_ARN" \
      --handler "lambda_function.lambda_handler" \
      --zip-file "fileb://$PLACEHOLDER_ZIP" \
      --timeout 30 \
      --memory-size 512 \
      --environment "$COMMON_ENV" \
      --region "$REGION" \
      --output text --query FunctionArn
    echo "   Created: $FNAME"
  fi
}

create_lambda "admin-api"
create_lambda "bikes-public"
create_lambda "checkout"
create_lambda "stripe-webhook"

rm -rf "$PLACEHOLDER_DIR"
echo "   All Lambda functions created. Run backend/deploy.sh to upload real code."


# ─────────────────────────────────────────────────────────────
# 6. Summary
# ─────────────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "✅ Phase 1 Infrastructure Complete"
echo "========================================================"
echo ""
echo "Resources created:"
echo "  S3 Buckets:       machx-cycles-images, machx-cycles-frontend"
echo "  Secrets Manager:  machx-db-credentials, machx-stripe-keys"
echo "  Cognito Pool ID:  $POOL_ID"
echo "  Cognito Client:   $CLIENT_ID"
echo "  IAM Role:         $ROLE_ARN"
echo "  Lambda functions: admin-api, bikes-public, checkout, stripe-webhook"
echo ""
echo "⚠️  Next steps — see infrastructure/setup-notes.md for details:"
echo "  1. Run schema.sql against RDS: database/schema.sql"
echo "  2. Update machx-db-credentials secret with real DB password"
echo "  3. Update machx-stripe-keys with real Stripe keys"
echo "  4. Create first Cognito admin user (command in setup-notes.md)"
echo "  5. Deploy real Lambda code: cd backend && ./deploy.sh admin-api"
echo "  6. Create API Gateway (see setup-notes.md Step 6)"
echo "  7. Create CloudFront distributions for images + frontend"
echo ""
