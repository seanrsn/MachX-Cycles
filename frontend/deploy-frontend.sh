#!/usr/bin/env bash
# Manual frontend deploy for machxcycles.com.
# CI only deploys the Lambdas; the frontend is uploaded by hand with this script.
# Mirrors the (now disabled) deploy-frontend job in .github/workflows/deploy.yml:
# full build (sitemap + vite + prerender), 4-pass S3 sync with per-file cache
# rules, then a CloudFront invalidation so the change is visible within ~1 min.
#
# Usage:  cd frontend && bash deploy-frontend.sh            (build + upload)
#         cd frontend && bash deploy-frontend.sh --no-build (upload existing dist/)
set -euo pipefail
cd "$(dirname "$0")"

BUCKET=machx-cycles-frontend
REGION=us-east-1
CLOUDFRONT_ID=E1DA2WCWTOBSNO

if [[ "${1:-}" != "--no-build" ]]; then
  echo ">> Building (sitemap + vite + prerender)"
  npm run build
fi

[[ -f dist/index.html ]] || { echo "dist/index.html missing - build first"; exit 1; }

echo ">> Pass 1: HTML (short cache, delete orphans)"
aws s3 sync dist/ "s3://$BUCKET/" --delete \
  --cache-control "public, max-age=300, must-revalidate" \
  --exclude "assets/*" \
  --exclude "*.png" --exclude "*.svg" --exclude "*.jpg" --exclude "*.webp" --exclude "*.ico" \
  --exclude "sitemap.xml" --exclude "robots.txt" \
  --region "$REGION" --only-show-errors

echo ">> Pass 2: hashed assets (immutable, 1 year)"
aws s3 sync dist/ "s3://$BUCKET/" \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*" --include "assets/*" \
  --region "$REGION" --only-show-errors

echo ">> Pass 3: brand images / favicons (30 days)"
aws s3 sync dist/ "s3://$BUCKET/" \
  --cache-control "public, max-age=2592000" \
  --exclude "*" --include "*.png" --include "*.svg" --include "*.jpg" --include "*.webp" --include "*.ico" \
  --region "$REGION" --only-show-errors

echo ">> Pass 4: sitemap + robots (1 hour)"
aws s3 sync dist/ "s3://$BUCKET/" \
  --cache-control "public, max-age=3600" \
  --exclude "*" --include "sitemap.xml" --include "robots.txt" \
  --region "$REGION" --only-show-errors

echo ">> Invalidating CloudFront"
INV=$(aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text)
echo "Invalidation $INV created. Live in about a minute: https://machxcycles.com"
