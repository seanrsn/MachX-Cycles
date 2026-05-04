# MachX Cycles — Phase 1 Infrastructure Setup Notes

Step-by-step guide to get Phase 1 running from scratch.

---

## Prerequisites

- **AWS CLI v2** configured (`aws configure`) with admin credentials in `us-east-1`
- **Python 3.12** + `pip3` (for packaging Lambdas)
- **MySQL client** (to run the schema against RDS)
- **jq** (used in setup.sh for JSON parsing)
- Access to the existing RDS instance: `brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com`
- Stripe account (test mode keys from dashboard.stripe.com)

Verify AWS access:
```bash
aws sts get-caller-identity
```

---

## Step 1 — Run the Database Schema

Create the `machx_cycles` database and all tables on the existing RDS instance.

```bash
mysql \
  -h brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com \
  -u <your_db_user> \
  -p \
  < database/schema.sql
```

Verify:
```sql
USE machx_cycles;
SHOW TABLES;
-- Should list: categories, bikes, bike_variants, bike_images, orders,
--              order_items, promotions, shipping_rates, site_settings, order_events
SELECT * FROM categories;
SELECT * FROM shipping_rates;
SELECT * FROM site_settings;
```

---

## Step 2 — Run setup.sh

Creates all AWS resources (S3, Secrets Manager, Cognito, IAM, Lambda functions).

```bash
chmod +x infrastructure/setup.sh
./infrastructure/setup.sh
```

**Save the output** — it prints your Cognito Pool ID and App Client ID at the end.

---

## Step 3 — Update Secrets Manager with Real Credentials

### DB Credentials
```bash
aws secretsmanager update-secret \
  --secret-id machx-db-credentials \
  --secret-string '{
    "host":     "brooklyn-bikery.c0vke2wqqjvd.us-east-1.rds.amazonaws.com",
    "port":     3306,
    "username": "your_db_username",
    "password": "your_db_password",
    "dbname":   "machx_cycles"
  }'
```

### Stripe Keys
Get these from https://dashboard.stripe.com/test/apikeys
```bash
aws secretsmanager update-secret \
  --secret-id machx-stripe-keys \
  --secret-string '{
    "secret_key":      "sk_test_...",
    "publishable_key": "pk_test_...",
    "webhook_secret":  "whsec_..."
  }'
```
(Webhook secret is obtained when you create the webhook endpoint in Stripe — do this in Phase 4.)

---

## Step 4 — Create First Admin User in Cognito

Replace `POOL_ID` with the ID from setup.sh output (looks like `us-east-1_XXXXXXXXX`).

```bash
# Create the user (Cognito sends a temp password via email)
aws cognito-idp admin-create-user \
  --user-pool-id POOL_ID \
  --username sean@machxcycles.com \
  --user-attributes Name=email,Value=sean@machxcycles.com Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --region us-east-1

# Set a permanent password (skip the forced-change flow)
aws cognito-idp admin-set-user-password \
  --user-pool-id POOL_ID \
  --username sean@machxcycles.com \
  --password "YourPermanentPassword123!" \
  --permanent \
  --region us-east-1
```

Test login (get tokens):
```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=sean@machxcycles.com,PASSWORD="YourPermanentPassword123!" \
  --client-id APP_CLIENT_ID \
  --region us-east-1
```
Copy the `AccessToken` from the output — you'll use it for testing admin endpoints.

---

## Step 5 — Deploy Real Lambda Code

```bash
cd backend
chmod +x deploy.sh

# Deploy admin-api first (Phase 1)
./deploy.sh admin-api
```

After deploying, update the handler name in the Lambda console:
- Function: `admin-api`
- Handler: `admin_api.lambda_handler`

```bash
aws lambda update-function-configuration \
  --function-name admin-api \
  --handler admin_api.lambda_handler \
  --region us-east-1
```

---

## Step 6 — Set Up API Gateway (Console)

The API Gateway setup is easiest to do in the AWS Console. Here's the config:

1. **Create REST API** — name: `machx-cycles-api`

2. **Create Cognito Authorizer**:
   - Type: Cognito
   - User Pool ARN: `arn:aws:cognito-idp:us-east-1:ACCOUNT_ID:userpool/POOL_ID`
   - Token source: `Authorization` (Bearer token from header)

3. **Create resources and methods**:
   - `/admin` resource → apply Cognito Authorizer to ALL methods under `/admin/*`
   - `/admin/bikes` → GET + POST → integrate with `admin-api` Lambda (Lambda Proxy)
   - `/admin/bikes/{id}` → GET + PUT + DELETE → `admin-api` Lambda
   - `/admin/bikes/{id}/variants` → POST → `admin-api` Lambda
   - `/admin/bikes/{id}/variants/{vid}` → PUT + DELETE → `admin-api` Lambda
   - `/admin/bikes/{id}/images` → POST → `admin-api` Lambda
   - `/admin/bikes/{id}/images/{image_id}` → DELETE → `admin-api` Lambda
   - `/admin/orders` → GET → `admin-api` Lambda
   - `/admin/orders/{id}` → GET + PATCH → `admin-api` Lambda
   - `/admin/promotions` → GET + POST → `admin-api` Lambda
   - `/admin/promotions/{id}` → PUT + DELETE → `admin-api` Lambda
   - `/admin/dashboard` → GET → `admin-api` Lambda
   - `/admin/settings` → GET + PUT → `admin-api` Lambda

4. **Enable CORS** on each resource (API Gateway > Resource > Actions > Enable CORS)

5. **Deploy to `prod` stage**:
   - Actions → Deploy API → Stage: `prod`
   - Note the Invoke URL: `https://XXXXX.execute-api.us-east-1.amazonaws.com/prod`

---

## Step 7 — CloudFront Distributions

### Images CDN
1. AWS Console → CloudFront → Create Distribution
2. Origin: `machx-cycles-images.s3.amazonaws.com`
3. Custom domain: `images.machxcycles.com` (add ACM certificate)
4. After creating, update Lambda env var `IMAGES_CDN_BASE` with the actual CloudFront URL

### Frontend (Phase 2)
1. Create Distribution
2. Origin: `machx-cycles-frontend.s3-website-us-east-1.amazonaws.com`
3. Custom error response: 404 → `/index.html` (status 200) — for SPA routing
4. Custom domain: `machxcycles.com`

---

## Step 8 — Test Admin Endpoints

Get an access token (from Step 4 login command output) and test:

```bash
TOKEN="YOUR_ACCESS_TOKEN_HERE"
BASE="https://XXXXX.execute-api.us-east-1.amazonaws.com/prod"

# Test dashboard (auth required)
curl -H "Authorization: Bearer $TOKEN" "$BASE/admin/dashboard" | jq .

# Create a category — should already exist from schema seed
curl -H "Authorization: Bearer $TOKEN" "$BASE/admin/settings" | jq .

# Create a test bike
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MachX Aero Pro 2025","category_id":1,"base_price":2499.99,"material":"Carbon Fiber","model_year":2025}' \
  "$BASE/admin/bikes" | jq .

# Add a variant
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"frame_size":"54","color":"Matte Black","stock_count":5}' \
  "$BASE/admin/bikes/1/variants" | jq .
```

---

## Verification Checklist

- [ ] `SHOW TABLES` in `machx_cycles` shows all 10 tables
- [ ] Seed data loaded: `SELECT * FROM categories` shows 6 rows
- [ ] Cognito login succeeds and returns an access token
- [ ] `GET /admin/dashboard` returns 200 with auth token
- [ ] `GET /admin/dashboard` returns 401 without auth token (Cognito Authorizer working)
- [ ] Create bike → add 3 variants → verify in DB
- [ ] `POST /admin/bikes/{id}/images` returns a presigned S3 URL
- [ ] Upload an image using the presigned URL → verify it appears in S3
- [ ] `GET /admin/settings` returns the 6 seeded site settings

---

## Troubleshooting

**Lambda can't connect to RDS**
- If RDS is in a VPC, add the Lambda to the same VPC security group
- Check that the security group allows inbound MySQL (3306) from the Lambda SG

**401 on admin endpoints**
- Make sure you're using the `AccessToken`, not the `IdToken`
- Tokens expire in 1 hour — re-run the `initiate-auth` command to get a fresh token

**CORS errors in browser**
- Run "Enable CORS" on each API Gateway resource
- Redeploy the API after enabling CORS

**Lambda timeout**
- Default is 30s — should be fine for DB queries
- Check CloudWatch Logs: AWS Console → Lambda → Monitor → View logs in CloudWatch
