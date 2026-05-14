#!/bin/bash
# deploy.sh — MachX Cycles frontend deployment
#
# Builds, syncs to S3 with per-prefix cache headers, invalidates CloudFront.
# Use this instead of `aws s3 sync dist/ ...` directly so cache-control on
# index.html stays at no-cache (otherwise browsers cache the old shell that
# references deleted chunk hashes → blank-screen-after-deploy bug).
#
# Usage:
#   cd frontend && ./deploy.sh             # build + sync + invalidate
#   cd frontend && ./deploy.sh --skip-build  # just sync + invalidate

set -e

REGION="us-east-1"
BUCKET="machx-cycles-frontend"
DIST_ID="E1DA2WCWTOBSNO"

if [ "$1" != "--skip-build" ]; then
  echo "📦 Building..."
  npm run build
fi

if [ ! -d dist ]; then
  echo "❌ No dist/ directory — run npm run build first"
  exit 1
fi

# Pass 1: HTML — must always revalidate so deploys propagate immediately.
# `no-cache` (NOT `no-store`) means: browser MAY cache, but MUST revalidate
# with origin every request. Origin returns 304 if unchanged → cheap.
echo "🌐 Syncing HTML (no-cache)..."
aws s3 sync dist/ "s3://${BUCKET}/" \
  --delete \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "assets/*" \
  --exclude "*.png" --exclude "*.svg" --exclude "*.jpg" --exclude "*.webp" --exclude "*.ico" \
  --exclude "sitemap.xml" --exclude "robots.txt" \
  --region "$REGION" > /dev/null

# Pass 2: hashed bundle assets — immutable, 1 year. The filename changes on
# every content change, so caching forever is safe.
echo "📦 Syncing hashed assets (immutable)..."
aws s3 sync dist/ "s3://${BUCKET}/" \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*" --include "assets/*" \
  --region "$REGION" > /dev/null

# Pass 3: brand images / favicons — 30 days
echo "🖼️  Syncing static images (30d)..."
aws s3 sync dist/ "s3://${BUCKET}/" \
  --cache-control "public, max-age=2592000" \
  --exclude "*" --include "*.png" --include "*.svg" --include "*.jpg" --include "*.webp" --include "*.ico" \
  --region "$REGION" > /dev/null

# Pass 4: sitemap + robots — 1 hour
echo "🤖 Syncing sitemap/robots (1h)..."
aws s3 sync dist/ "s3://${BUCKET}/" \
  --cache-control "public, max-age=3600" \
  --exclude "*" --include "sitemap.xml" --include "robots.txt" \
  --region "$REGION" > /dev/null

echo "🌪️  Invalidating CloudFront..."
INV_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "✅ Done. CloudFront invalidation: $INV_ID"
