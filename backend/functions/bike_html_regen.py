"""
bike_html_regen.py — MachX Cycles "regenerate one bike's prerendered HTML" Lambda

Invoked async by admin-api whenever a bike is created / updated / deleted.
Reads the SPA shell from S3, swaps in per-bike <head> tags, writes the result
to /bikes/{slug}/index.html. When the bike is inactive or sold, deletes the
file instead.

Why this is a separate Lambda (not part of admin-api):
  admin-api lives in a VPC (RDS access). VPCs without a NAT gateway can't
  reach AWS API endpoints like CloudFront — calls hang for 30s and time out.
  This Lambda runs OUTSIDE the VPC so its boto3 calls go through normally.

Event payload (fired via lambda.invoke InvocationType=Event):
  {
    "action": "upsert",   # or "delete"
    "bike": {
      "id": 1, "slug": "cannondale-supersix", "name": "...", "category_name": "...",
      "description": "...", "base_price": "1499.99", "is_active": 1, "sold": 0,
      "brand": "Cannondale", "model_year": 2020, "material": "carbon",
      "first_image_url": "https://..."
    }
  }
"""

import json
import os
import re
from datetime import datetime, timedelta

import boto3

FRONTEND_BUCKET = os.environ.get('FRONTEND_BUCKET', 'machx-cycles-frontend')
CLOUDFRONT_DIST = os.environ.get('CLOUDFRONT_DIST', 'E1DA2WCWTOBSNO')
SITE_ORIGIN     = os.environ.get('SITE_ORIGIN', 'https://machxcycles.com')

s3 = boto3.client('s3')
cf = boto3.client('cloudfront')


# ── Helpers ─────────────────────────────────────────────────────────────────

def _safe_jsonld(obj):
    """Same escape as frontend safeJsonLd — prevent </script> breakout."""
    s = json.dumps(obj, ensure_ascii=False)
    return (s
        .replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace(' ', '\\u2028')
        .replace(' ', '\\u2029'))


def _attr_escape(s):
    if s is None:
        return ''
    return (str(s)
        .replace('&', '&amp;')
        .replace('"', '&quot;')
        .replace('<', '&lt;')
        .replace('>', '&gt;'))


def _category_slug(name):
    """Mirrors src/utils/categorySlug.js — keep in sync."""
    if not name:
        return ''
    s = re.sub(r'[^a-z0-9]+', '-', str(name).lower())
    return s.strip('-')


def _build_head(bike):
    name = bike.get('name') or 'Bike'
    slug = bike.get('slug') or ''
    category_name = bike.get('category_name') or ''
    description = (bike.get('description') or '').strip()
    try:
        price_f = float(bike.get('base_price') or 0)
    except (TypeError, ValueError):
        price_f = 0.0
    price_str = f"{price_f:.2f}"
    sold = bool(bike.get('sold'))
    image_url = bike.get('first_image_url') or ''
    canonical = f"{SITE_ORIGIN}/bikes/{slug}"

    base_title = f"{name} — Used {category_name}".strip()
    cap = 45
    if len(base_title) <= cap:
        title = f"{base_title} | MachX Cycles"
    else:
        cut = base_title[:cap]
        last_space = cut.rfind(' ')
        truncated = cut[:last_space] if last_space > 25 else cut
        title = f"{truncated} | MachX Cycles"

    if description:
        d = description[:152]
        last_space = d.rfind(' ')
        meta_desc = (d[:last_space] if last_space > 100 else d) + '…'
    else:
        cat_lower = category_name.lower() if category_name else 'bike'
        price_part = f" Now ${price_f:,.2f}." if price_f > 0 else ''
        meta_desc = f"Shop the {name} at MachX Cycles. Pre-owned {cat_lower}, inspected and tuned.{price_part}"

    og_image = image_url or f"{SITE_ORIGIN}/MachXPic.jpg"

    valid_until = (datetime.utcnow() + timedelta(days=365)).date().isoformat()

    product_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "description": description or f"Pre-owned {category_name or ''} bike from MachX Cycles",
        "sku": str(bike.get('id', '')),
        "itemCondition": "https://schema.org/UsedCondition",
        "category": category_name or None,
        "material": bike.get('material') or None,
        "offers": {
            "@type": "Offer",
            "url": canonical,
            "priceCurrency": "USD",
            "price": price_str,
            "priceValidUntil": valid_until,
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/OutOfStock" if sold else "https://schema.org/InStock",
            "seller": {
                "@type": "Organization",
                "name": "MachX Cycles",
                "url": "https://machxcycles.com/",
            },
        },
    }
    if image_url:
        product_ld["image"] = image_url
    brand = bike.get('brand')
    if brand and brand != 'MachX':
        product_ld["brand"] = {"@type": "Brand", "name": brand}
    if bike.get('model_year'):
        product_ld["productionDate"] = str(bike['model_year'])
    product_ld = {k: v for k, v in product_ld.items() if v is not None}

    breadcrumb_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_ORIGIN}/"},
            {"@type": "ListItem", "position": 2, "name": "Shop", "item": f"{SITE_ORIGIN}/shop"},
        ],
    }
    if category_name:
        breadcrumb_ld["itemListElement"].extend([
            {"@type": "ListItem", "position": 3, "name": category_name,
             "item": f"{SITE_ORIGIN}/shop/{_category_slug(category_name)}"},
            {"@type": "ListItem", "position": 4, "name": name, "item": canonical},
        ])
    else:
        breadcrumb_ld["itemListElement"].append(
            {"@type": "ListItem", "position": 3, "name": name, "item": canonical}
        )

    title_esc     = _attr_escape(title)
    desc_esc      = _attr_escape(meta_desc)
    canonical_esc = _attr_escape(canonical)
    og_image_esc  = _attr_escape(og_image)
    og_title_esc  = _attr_escape(f"{name} — Used | MachX Cycles")
    og_desc_short = _attr_escape(
        description[:200] if description
        else f"Pre-owned {category_name.lower() if category_name else 'bike'} — inspected and ride-ready."
    )

    return f"""<title>{title_esc}</title>
<meta name="description" content="{desc_esc}" data-bike-meta>
<link rel="canonical" href="{canonical_esc}" data-bike-meta>
<meta property="og:type" content="product" data-bike-meta>
<meta property="og:title" content="{og_title_esc}" data-bike-meta>
<meta property="og:description" content="{og_desc_short}" data-bike-meta>
<meta property="og:url" content="{canonical_esc}" data-bike-meta>
<meta property="og:image" content="{og_image_esc}" data-bike-meta>
<meta property="og:price:amount" content="{price_str}" data-bike-meta>
<meta property="og:price:currency" content="USD" data-bike-meta>
<meta property="product:price:amount" content="{price_str}" data-bike-meta>
<meta property="product:price:currency" content="USD" data-bike-meta>
<meta name="twitter:card" content="summary_large_image" data-bike-meta>
<meta name="twitter:title" content="{og_title_esc}" data-bike-meta>
<meta name="twitter:description" content="{og_desc_short}" data-bike-meta>
<meta name="twitter:image" content="{og_image_esc}" data-bike-meta>
<script type="application/ld+json" data-bike-meta>{_safe_jsonld(product_ld)}</script>
<script type="application/ld+json" data-bike-meta>{_safe_jsonld(breadcrumb_ld)}</script>
"""


def _invalidate(slug):
    try:
        cf.create_invalidation(
            DistributionId=CLOUDFRONT_DIST,
            InvalidationBatch={
                'Paths': {'Quantity': 2, 'Items': [f"/bikes/{slug}", f"/bikes/{slug}/*"]},
                'CallerReference': f"bike-{slug}-{int(datetime.utcnow().timestamp() * 1000)}",
            }
        )
    except Exception as e:
        print(f"[regen] CF invalidation failed for /bikes/{slug}: {e}")


# ── Lambda handler ──────────────────────────────────────────────────────────

def _process_one(payload):
    """Run the regen for a single payload. Returns dict result."""
    bike = payload.get('bike') or {}
    slug = bike.get('slug')
    if not slug:
        print("[regen] skip: no slug on bike")
        return {'ok': False, 'reason': 'no_slug'}
    return _regen_bike(payload, slug, bike)


def lambda_handler(event, context):
    """Two trigger paths:
    1. S3 ObjectCreated event on regen-queue/*.json (admin-api drops trigger
       files there). Each Records[i] contains the bucket+key; we fetch the
       JSON payload, process it, then delete the trigger file.
    2. Direct invoke with {action, bike: {...}} (e.g. from CLI for testing).
    """
    print(f"[regen] event: {json.dumps(event)[:500]}")

    # S3-event branch
    if 'Records' in event and event['Records'] and event['Records'][0].get('s3'):
        results = []
        for rec in event['Records']:
            bucket = rec['s3']['bucket']['name']
            key = rec['s3']['object']['key']
            try:
                obj = s3.get_object(Bucket=bucket, Key=key)
                payload = json.loads(obj['Body'].read())
            except Exception as e:
                print(f"[regen] cannot read trigger file s3://{bucket}/{key}: {e}")
                continue
            result = _process_one(payload)
            results.append(result)
            # Always clean up the trigger file
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception as e:
                print(f"[regen] failed to delete trigger {key}: {e}")
        return {'ok': True, 'results': results}

    # Direct-invoke branch
    return _process_one(event)


def _regen_bike(event, slug, bike):
    """The original regen logic, factored out so both trigger paths reuse it."""

    target_key = f"bikes/{slug}/index.html"
    action = event.get('action', 'upsert')
    inactive_or_sold = (not bike.get('is_active')) or bool(bike.get('sold'))

    # Delete branch: explicit delete OR upsert of an inactive/sold bike
    if action == 'delete' or inactive_or_sold:
        try:
            s3.delete_object(Bucket=FRONTEND_BUCKET, Key=target_key)
            print(f"[regen] deleted s3://{FRONTEND_BUCKET}/{target_key}")
        except Exception as e:
            print(f"[regen] delete failed for {target_key}: {e}")
        _invalidate(slug)
        return {'ok': True, 'action': 'deleted'}

    # Upsert: read SPA shell, swap meta, write
    try:
        shell = s3.get_object(Bucket=FRONTEND_BUCKET, Key='index.html')['Body'].read().decode('utf-8')
    except Exception as e:
        print(f"[regen] cannot read SPA shell: {e}")
        return {'ok': False, 'reason': 'shell_read_failed'}

    head = _build_head(bike)

    # Strip the shell's defaults so per-bike tags win unambiguously:
    #  - default <title>
    #  - default <link rel="canonical"> (else bots see homepage canonical first)
    #  - default og:title / og:description / og:url / og:image
    #  - default twitter:title / description / image / card
    #  - any prior data-bike-meta tags from a previous regen (avoid accumulation)
    new_html = re.sub(r'<title>[^<]*</title>', '', shell, count=1)
    new_html = re.sub(r'<link[^>]+rel\s*=\s*["\']canonical["\'][^>]*>', '', new_html, flags=re.I)
    new_html = re.sub(r'<meta[^>]+(?:property|name)\s*=\s*["\'](?:og:title|og:description|og:url|og:image|og:type|twitter:title|twitter:description|twitter:image|twitter:card|description)["\'][^>]*>', '', new_html, flags=re.I)
    new_html = re.sub(r'<[^>]+\sdata-bike-meta[^>]*>(?:[^<]*</[^>]+>)?', '', new_html)
    new_html = new_html.replace('</head>', head + '</head>', 1)

    try:
        s3.put_object(
            Bucket=FRONTEND_BUCKET,
            Key=target_key,
            Body=new_html.encode('utf-8'),
            ContentType='text/html; charset=utf-8',
            CacheControl='public, max-age=300, must-revalidate',
        )
        print(f"[regen] wrote s3://{FRONTEND_BUCKET}/{target_key} ({len(new_html)} bytes)")
    except Exception as e:
        print(f"[regen] put failed for {target_key}: {e}")
        return {'ok': False, 'reason': 'put_failed'}

    _invalidate(slug)
    return {'ok': True, 'action': 'upserted'}
