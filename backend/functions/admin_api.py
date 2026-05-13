"""
admin_api.py â€” MachX Cycles Admin Lambda

Handles all admin CRUD operations. Authentication is enforced at the API
Gateway level via Cognito Authorizer â€” this Lambda only receives requests
that have already been validated with a valid admin access token.

Routes:
  GET    /admin/bikes                         list_bikes
  POST   /admin/bikes                         create_bike
  PUT    /admin/bikes/{id}                    update_bike
  DELETE /admin/bikes/{id}                    delete_bike

  POST   /admin/bikes/{id}/images             upload_image (presigned URL)
  PUT    /admin/bikes/{id}/images/reorder    reorder_images
  DELETE /admin/bikes/{id}/images/{img_id}   delete_image

  GET    /admin/orders                        list_orders
  GET    /admin/orders/{id}                   get_order
  PATCH  /admin/orders/{id}                   update_order

  GET    /admin/promotions                    list_promotions
  POST   /admin/promotions                    create_promotion
  PUT    /admin/promotions/{id}               update_promotion
  DELETE /admin/promotions/{id}               delete_promotion

  GET    /admin/dashboard                     get_dashboard
  GET    /admin/settings                      get_settings
  PUT    /admin/settings                      update_settings
"""

import json
import logging
import re
import uuid
from datetime import date, datetime

import boto3
import pymysql

from shared.config import IMAGES_BUCKET, IMAGES_CDN_BASE, AWS_REGION, PRESIGNED_URL_EXPIRY_SECONDS
from shared.db import get_connection
from shared.response import (
    success, error, handle_options,
    parse_body, get_query_params,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# â”€â”€ Path patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_RE_BIKES           = re.compile(r'^/admin/bikes$')
_RE_BIKE            = re.compile(r'^/admin/bikes/(\d+)$')
_RE_BIKE_RELEASE    = re.compile(r'^/admin/bikes/(\d+)/release-reservation$')
_RE_IMAGES          = re.compile(r'^/admin/bikes/(\d+)/images$')
_RE_IMAGES_REORDER  = re.compile(r'^/admin/bikes/(\d+)/images/reorder$')
_RE_IMAGE           = re.compile(r'^/admin/bikes/(\d+)/images/(\d+)$')
_RE_ORDERS          = re.compile(r'^/admin/orders$')
_RE_ORDER           = re.compile(r'^/admin/orders/(\d+)$')
_RE_PROMOTIONS      = re.compile(r'^/admin/promotions$')
_RE_PROMOTION       = re.compile(r'^/admin/promotions/(\d+)$')
_RE_DASHBOARD       = re.compile(r'^/admin/dashboard$')
_RE_SETTINGS        = re.compile(r'^/admin/settings$')


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Entry point
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def lambda_handler(event, context):
    method = event.get('httpMethod', 'GET')
    path   = event.get('path', '')

    if method == 'OPTIONS':
        return handle_options()

    # Defense-in-depth auth check. The API Gateway Cognito Authorizer is the
    # primary gate, but if a new admin route is added without the authorizer
    # attached, or someone hits the Lambda via a Function URL directly, this
    # second check still rejects. The presence of authorizer.claims is itself
    # proof that Cognito ran (API Gateway populates it from the verified JWT).
    auth_check = _require_admin(event)
    if auth_check is not None:
        return auth_check

    try:
        return _route(method, path, event)
    except pymysql.Error:
        # Don't leak DB errors (column names, host, etc.) to the client. The
        # full traceback is in CloudWatch via logger.exception.
        logger.exception("Database error")
        return error('Database error', status=500)
    except Exception:
        logger.exception("Unhandled exception")
        return error('Internal server error', status=500)


def _require_admin(event):
    """Returns None if request has valid Cognito claims (i.e. API Gateway
    authorizer ran and produced a verified JWT), else returns a 401."""
    claims = (
        event.get('requestContext', {})
             .get('authorizer', {})
             .get('claims', {})
    )
    if not claims or not claims.get('sub'):
        logger.warning(f"Admin endpoint called without Cognito claims: {event.get('path')}")
        return error('Unauthorized', status=401)
    return None


def _route(method, path, event):
    # One-off migration runner — idempotent, safe to call repeatedly.
    if path == '/admin/migrate' and method == 'POST':
        return _run_migrations()

    # Bikes collection
    if _RE_BIKES.match(path):
        if method == 'GET':  return list_bikes(event)
        if method == 'POST': return create_bike(event)

    # Release reservation (must come BEFORE single bike since it has a longer
    # path that would never match _RE_BIKE anyway, but explicit ordering for safety)
    m = _RE_BIKE_RELEASE.match(path)
    if m:
        bike_id = int(m.group(1))
        if method == 'POST': return release_reservation(bike_id, event)

    # Single bike
    m = _RE_BIKE.match(path)
    if m:
        bike_id = int(m.group(1))
        if method == 'GET':    return get_bike(bike_id)
        if method == 'PUT':    return update_bike(bike_id, event)
        if method == 'DELETE': return delete_bike(bike_id)

    # Images reorder (must come BEFORE single image — '/images/reorder' would
    # otherwise match _RE_IMAGE if 'reorder' were numeric; it isn't, but we
    # still keep the order explicit for safety)
    m = _RE_IMAGES_REORDER.match(path)
    if m:
        bike_id = int(m.group(1))
        if method == 'PUT': return reorder_images(bike_id, event)

    # Images collection
    m = _RE_IMAGES.match(path)
    if m:
        bike_id = int(m.group(1))
        if method == 'POST': return upload_image(bike_id, event)

    # Single image
    m = _RE_IMAGE.match(path)
    if m:
        bike_id, img_id = int(m.group(1)), int(m.group(2))
        if method == 'DELETE': return delete_image(bike_id, img_id)

    # Orders collection
    if _RE_ORDERS.match(path):
        if method == 'GET': return list_orders(event)

    # Single order
    m = _RE_ORDER.match(path)
    if m:
        order_id = int(m.group(1))
        if method == 'GET':   return get_order(order_id)
        if method == 'PATCH': return update_order(order_id, event)

    # Promotions collection
    if _RE_PROMOTIONS.match(path):
        if method == 'GET':  return list_promotions()
        if method == 'POST': return create_promotion(event)

    # Single promotion
    m = _RE_PROMOTION.match(path)
    if m:
        promo_id = int(m.group(1))
        if method == 'PUT':    return update_promotion(promo_id, event)
        if method == 'DELETE': return delete_promotion(promo_id)

    # Dashboard
    if _RE_DASHBOARD.match(path):
        if method == 'GET': return get_dashboard()

    # Settings
    if _RE_SETTINGS.match(path):
        if method == 'GET': return get_settings()
        if method == 'PUT': return update_settings(event)

    # Don't reflect attacker-controlled path in the response — log it instead.
    print(f"admin_api 404: {method} {path}")
    return error('Not found', status=404)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Helpers
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _slugify(text: str) -> str:
    """Convert a string to a URL-safe slug."""
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower())
    return slug.strip('-')


# Field-length caps for admin text inputs. Defense-in-depth so an admin
# (or anyone with a stolen admin token) can't paste arbitrary novels into
# the bike record. The frontend escapes JSON-LD strings via safeJsonLd, but
# we also strip control characters here to keep the DB clean.
_TEXT_CAPS = {
    'name':            255,
    'description':     5000,
    'material':        50,
    'frame_size':      20,
    'condition_grade': 20,
    'weight':          50,
    'brand':           100,
}


def _sanitize_text(value, max_len):
    """Strip C0 control chars (except \\n, \\r, \\t) and cap to max_len.
    Leaves HTML/markup intact — we don't render bike fields with
    dangerouslySetInnerHTML. JSON-LD scripts are escaped client-side via
    safeJsonLd, so `</script>` etc. is safe even if it lands in the DB."""
    if value is None:
        return None
    s = str(value)
    # Drop C0 controls except tab/newline/carriage-return
    s = ''.join(c for c in s if c >= ' ' or c in '\t\n\r')
    return s[:max_len]


def _sanitize_bike_body(body):
    """Apply text caps + control-char strip to admin-controlled bike fields."""
    for field, cap in _TEXT_CAPS.items():
        if field in body:
            body[field] = _sanitize_text(body[field], cap)
    return body


def _unique_slug(cur, base_slug: str, exclude_id: int = None) -> str:
    """Ensure the slug is unique in the bikes table; append -2, -3, etc. if needed."""
    slug  = base_slug
    count = 1
    while True:
        if exclude_id:
            cur.execute(
                "SELECT id FROM bikes WHERE slug = %s AND id != %s", (slug, exclude_id)
            )
        else:
            cur.execute("SELECT id FROM bikes WHERE slug = %s", (slug,))
        if not cur.fetchone():
            return slug
        count += 1
        slug = f"{base_slug}-{count}"


# ─────────────────────────────────────────────────────────────────────────────
# DB MIGRATIONS — idempotent. Add new ALTER TABLE statements here as needed.
# Run via: aws lambda invoke admin-api with POST /admin/migrate
# ─────────────────────────────────────────────────────────────────────────────

_PENDING_MIGRATIONS = [
    # 2026-05-12: shipping/tracking columns
    ("orders", "tracking_number",   "ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100) DEFAULT NULL"),
    ("orders", "tracking_carrier",  "ALTER TABLE orders ADD COLUMN tracking_carrier VARCHAR(20) DEFAULT NULL"),
    ("orders", "shipped_at",        "ALTER TABLE orders ADD COLUMN shipped_at DATETIME DEFAULT NULL"),
    ("orders", "estimated_delivery","ALTER TABLE orders ADD COLUMN estimated_delivery DATE DEFAULT NULL"),
]


def _run_migrations():
    applied, skipped = [], []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for table, column, ddl in _PENDING_MIGRATIONS:
                cur.execute(
                    """SELECT 1 FROM information_schema.columns
                       WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s LIMIT 1""",
                    (table, column)
                )
                if cur.fetchone():
                    skipped.append(f"{table}.{column}")
                    continue
                cur.execute(ddl)
                applied.append(f"{table}.{column}")

            # Data cleanups — idempotent because each WHERE only matches the
            # OLD form. Once normalized, subsequent runs do nothing.
            data_changes = []

            cur.execute(
                "UPDATE order_events SET message = 'Order placed' "
                "WHERE message = 'Order materialized from checkout session on payment success'"
            )
            if cur.rowcount: data_changes.append(f"created→Order placed: {cur.rowcount}")

            cur.execute(
                "UPDATE order_events SET event_type = 'payment_received', message = 'Payment received' "
                "WHERE event_type = 'payment_intent.succeeded'"
            )
            if cur.rowcount: data_changes.append(f"payment_intent.succeeded→payment_received: {cur.rowcount}")

            # Strip "(tracking: XYZ)" suffix from old shipped messages — tracking
            # number is shown in the dedicated card, not the timeline message.
            cur.execute(
                r"UPDATE order_events SET message = REGEXP_REPLACE(message, ' \\(tracking:[^)]*\\)$', '') "
                "WHERE event_type = 'shipped' AND message LIKE 'Shipped via%(tracking:%)'"
            )
            if cur.rowcount: data_changes.append(f"shipped strip-tracking: {cur.rowcount}")

            # Collapse "Status changed from X to shipped" entries that duplicate
            # an adjacent shipped event.
            cur.execute("""
                DELETE sc FROM order_events sc
                INNER JOIN order_events sh
                  ON sh.order_id = sc.order_id
                 AND sh.event_type = 'shipped'
                 AND ABS(TIMESTAMPDIFF(SECOND, sh.created_at, sc.created_at)) < 60
                WHERE sc.event_type = 'status_change'
                  AND sc.message LIKE '%to shipped%'
            """)
            if cur.rowcount: data_changes.append(f"deduped status_change/shipped: {cur.rowcount}")

        conn.commit()
        return success({'applied': applied, 'skipped': skipped, 'data_cleanups': data_changes})
    except Exception as e:
        conn.rollback()
        print(f"_run_migrations error: {e}")
        return error('Migration failed', status=500)


def _log_order_event(cur, order_id: int, event_type: str, message: str, metadata: dict = None):
    cur.execute(
        """
        INSERT INTO order_events (order_id, event_type, message, metadata)
        VALUES (%s, %s, %s, %s)
        """,
        (order_id, event_type, message, json.dumps(metadata) if metadata else None)
    )


# ──────────────────────────────────────────────────────────────────────────────
# PER-BIKE STATIC HTML REGENERATION
#
# Every active bike has a prerendered /bikes/{slug}/index.html in S3 so
# crawlers + social-preview bots see real meta tags (title, description, OG,
# Twitter, JSON-LD Product). The Vite build's prerender script generates these
# at build time — but admin actions happen live, so we regenerate the HTML
# inline whenever a bike is created / updated / deactivated.
#
# Approach: read the SPA shell from S3 root, swap in per-bike <head> tags,
# write to /bikes/{slug}/index.html. Body stays as the unchanged SPA shell;
# React hydrates and renders the bike-detail UI client-side, same as a real
# prerendered page.
#
# Failure-tolerant: any exception is logged but doesn't break the admin save.
# ──────────────────────────────────────────────────────────────────────────────

FRONTEND_BUCKET = 'machx-cycles-frontend'
CLOUDFRONT_DIST = 'E1DA2WCWTOBSNO'
SITE_ORIGIN     = 'https://machxcycles.com'


def _safe_jsonld(obj):
    """Same escape as frontend safeJsonLd: prevent </script> breakout + safe Unicode."""
    s = json.dumps(obj, ensure_ascii=False)
    return (s
        .replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace(' ', '\\u2028')
        .replace(' ', '\\u2029'))


def _html_attr_escape(s):
    """Escape for use inside an HTML attribute value (between double quotes)."""
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


def _build_bike_meta_html(bike: dict) -> str:
    """Generate the per-bike <head> snippet (title + meta + JSON-LD)."""
    name = bike.get('name') or 'Bike'
    slug = bike.get('slug') or ''
    category_name = bike.get('category_name') or ''
    description = (bike.get('description') or '').strip()
    price = bike.get('base_price') or 0
    try:
        price_str = f"{float(price):.2f}"
    except (TypeError, ValueError):
        price_str = '0.00'
    sold = bool(bike.get('sold'))
    image_url = ''
    images = bike.get('images') or []
    if images:
        image_url = (images[0] or {}).get('url') or ''
    canonical = f"{SITE_ORIGIN}/bikes/{slug}"

    # Title — keep under ~62 chars for SERP
    base_title = f"{name} — Used {category_name}".strip()
    cap = 45
    if len(base_title) <= cap:
        title = f"{base_title} | MachX Cycles"
    else:
        cut = base_title[:cap]
        last_space = cut.rfind(' ')
        truncated = cut[:last_space] if last_space > 25 else cut
        title = f"{truncated} | MachX Cycles"

    # Description — 152 chars max, word-boundary
    if description:
        d = description[:152]
        last_space = d.rfind(' ')
        meta_desc = (d[:last_space] if last_space > 100 else d) + '…'
    else:
        cat_lower = category_name.lower() if category_name else 'bike'
        price_part = f" Now ${float(price):,.2f}." if float(price or 0) > 0 else ''
        meta_desc = f"Shop the {name} at MachX Cycles. Pre-owned {cat_lower}, inspected and tuned.{price_part}"

    og_image = image_url or f"{SITE_ORIGIN}/MachXPic.jpg"

    # JSON-LD Product
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
            "priceValidUntil": (datetime.utcnow().date().replace(year=datetime.utcnow().year + 1)).isoformat(),
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
    # Drop None values for clean JSON
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
        breadcrumb_ld["itemListElement"].append({
            "@type": "ListItem", "position": 3, "name": category_name,
            "item": f"{SITE_ORIGIN}/shop/{_category_slug(category_name)}",
        })
        breadcrumb_ld["itemListElement"].append({
            "@type": "ListItem", "position": 4, "name": name, "item": canonical,
        })
    else:
        breadcrumb_ld["itemListElement"].append({
            "@type": "ListItem", "position": 3, "name": name, "item": canonical,
        })

    title_esc = _html_attr_escape(title)
    desc_esc  = _html_attr_escape(meta_desc)
    canonical_esc = _html_attr_escape(canonical)
    og_image_esc  = _html_attr_escape(og_image)
    og_title_esc  = _html_attr_escape(f"{name} — Used | MachX Cycles")
    og_desc_short = _html_attr_escape(
        (description[:200] if description else f"Pre-owned {category_name.lower() if category_name else 'bike'} — inspected and ride-ready.")
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


_REGEN_S3 = None
def _regen_s3():
    """S3 client — VPC has an S3 gateway endpoint so this works without NAT."""
    global _REGEN_S3
    if _REGEN_S3 is None:
        _REGEN_S3 = boto3.client('s3', region_name=AWS_REGION)
    return _REGEN_S3


def _regenerate_bike_html(bike_id: int, action: str = 'upsert'):
    """Drop a regen-trigger file into S3 so the (non-VPC) sibling Lambda
    machx-bike-html-regen picks it up and regenerates /bikes/{slug}/index.html.

    Why not just call lambda.invoke or do the S3 work inline?
    - admin-api lives in a VPC for RDS access. The VPC has an S3 *gateway*
      endpoint (default, free) so S3 PutObject works. But Lambda + CloudFront
      service endpoints aren't reachable from the VPC without NAT/interface
      endpoints, which need IAM perms we don't have.
    - So we write a trigger file to s3://machx-cycles-frontend/regen-queue/...
      and an S3 ObjectCreated event fires the regen Lambda (outside the VPC).
      That Lambda reads the bike payload, regenerates the HTML, and deletes
      the trigger file. Fire-and-forget; admin save returns immediately.

    Best-effort: any failure is logged but doesn't break the admin save.
    """
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT b.id, b.slug, b.name, b.description, b.base_price,
                          b.material, b.brand, b.model_year, b.is_active, b.sold,
                          c.name AS category_name,
                          (SELECT bi.url FROM bike_images bi WHERE bi.bike_id = b.id
                           ORDER BY bi.sort_order ASC LIMIT 1) AS first_image_url
                   FROM bikes b LEFT JOIN categories c ON c.id = b.category_id
                   WHERE b.id = %s""",
                (bike_id,)
            )
            bike = cur.fetchone()
        if not bike or not bike.get('slug'):
            return

        # Convert Decimal/date types to JSON-safe primitives
        payload_bike = {}
        for k, v in bike.items():
            if v is None:
                payload_bike[k] = None
            elif hasattr(v, 'isoformat'):
                payload_bike[k] = v.isoformat()
            elif isinstance(v, (int, float, bool, str)):
                payload_bike[k] = v
            else:
                payload_bike[k] = str(v)  # Decimal, etc.

        trigger_key = f"regen-queue/bike-{bike_id}-{int(datetime.utcnow().timestamp() * 1000)}.json"
        body = json.dumps({'action': action, 'bike': payload_bike}).encode('utf-8')

        try:
            _regen_s3().put_object(
                Bucket='machx-cycles-frontend',
                Key=trigger_key,
                Body=body,
                ContentType='application/json',
            )
            print(f"_regenerate_bike_html: queued regen for bike {bike_id} via {trigger_key}")
        except Exception as e:
            print(f"_regenerate_bike_html: S3 put failed for bike {bike_id}: {e}")
    except Exception as e:
        print(f"_regenerate_bike_html: unexpected error for bike {bike_id}: {e}")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# BIKES
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def list_bikes(event):
    params = get_query_params(event)
    conn   = get_connection()
    with conn.cursor() as cur:
        where_clauses = []
        args          = []

        if params.get('search'):
            where_clauses.append("b.name LIKE %s")
            args.append(f"%{params['search']}%")
        if params.get('category_id'):
            where_clauses.append("b.category_id = %s")
            args.append(int(params['category_id']))
        if params.get('is_active') is not None:
            where_clauses.append("b.is_active = %s")
            args.append(int(params['is_active']))

        where = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''

        cur.execute(
            f"""
            SELECT
                b.*,
                c.name  AS category_name,
                COUNT(DISTINCT bi.id) AS image_count,
                (SELECT url FROM bike_images WHERE bike_id = b.id ORDER BY sort_order LIMIT 1) AS primary_image_url
            FROM bikes b
            LEFT JOIN categories  c  ON c.id  = b.category_id
            LEFT JOIN bike_images  bi  ON bi.bike_id = b.id
            {where}
            GROUP BY b.id
            ORDER BY b.created_at DESC
            """,
            args
        )
        bikes = cur.fetchall()
    return success({'bikes': bikes, 'total': len(bikes)})


def get_bike(bike_id: int):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT b.*, c.name AS category_name
            FROM bikes b
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.id = %s
            """,
            (bike_id,)
        )
        bike = cur.fetchone()
        if not bike:
            return error('Bike not found', status=404)

        cur.execute(
            "SELECT * FROM bike_images WHERE bike_id = %s ORDER BY sort_order",
            (bike_id,)
        )
        bike['images'] = cur.fetchall()

    return success(bike)


def create_bike(event):
    body = parse_body(event)

    # Validate required fields
    for field in ('name', 'category_id', 'base_price'):
        if not body.get(field) and body.get(field) != 0:
            return error(f'{field} is required', status=400)

    body = _sanitize_bike_body(body)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            base_slug = _slugify(str(body['name']))
            slug      = _unique_slug(cur, base_slug)

            specs = body.get('specs')
            if specs and not isinstance(specs, str):
                specs = json.dumps(specs)

            cur.execute(
                """
                INSERT INTO bikes
                    (category_id, name, slug, description, base_price, msrp,
                     material, frame_size, condition_grade, weight, brand, model_year,
                     specs, featured, is_active, sold)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    body['category_id'],
                    body['name'],
                    slug,
                    body.get('description'),
                    body['base_price'],
                    body.get('msrp'),  # original retail price
                    body.get('material'),
                    body.get('frame_size'),
                    body.get('condition_grade'),
                    body.get('weight'),
                    body.get('brand', 'MachX'),
                    body.get('model_year'),
                    specs,
                    int(body.get('featured', 0)),
                    int(body.get('is_active', 1)),
                    int(body.get('sold', 0)),
                )
            )
            bike_id = cur.lastrowid
        conn.commit()

        # Generate the per-bike static HTML so /bikes/{slug} works immediately
        # (and crawlers + social-preview bots see real meta tags).
        _regenerate_bike_html(bike_id)

        return get_bike(bike_id)  # re-fetch and return full record
    except Exception:
        conn.rollback()
        raise


def update_bike(bike_id: int, event):
    body = parse_body(event)
    if not body:
        return error('No fields to update', status=400)

    body = _sanitize_bike_body(body)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Verify bike exists
            cur.execute("SELECT id, slug FROM bikes WHERE id = %s", (bike_id,))
            existing = cur.fetchone()
            if not existing:
                return error('Bike not found', status=404)

            # Build dynamic UPDATE
            updatable = ['category_id', 'name', 'description', 'base_price', 'msrp',
                         'material', 'frame_size', 'condition_grade', 'weight', 'brand',
                         'model_year', 'featured', 'is_active', 'sold']
            set_parts, args = [], []

            for field in updatable:
                if field in body:
                    set_parts.append(f"`{field}` = %s")
                    args.append(body[field])

            if 'name' in body:
                base_slug = _slugify(str(body['name']))
                slug      = _unique_slug(cur, base_slug, exclude_id=bike_id)
                set_parts.append("`slug` = %s")
                args.append(slug)

            if 'specs' in body:
                specs = body['specs']
                if specs and not isinstance(specs, str):
                    specs = json.dumps(specs)
                set_parts.append("`specs` = %s")
                args.append(specs)

            if not set_parts:
                return error('No valid fields to update', status=400)

            args.append(bike_id)
            cur.execute(
                f"UPDATE bikes SET {', '.join(set_parts)} WHERE id = %s",
                args
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    # Regenerate the per-bike static HTML to reflect the update (or remove it
    # if the bike was just deactivated/marked sold).
    _regenerate_bike_html(bike_id)

    return get_bike(bike_id)


def delete_bike(bike_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM bikes WHERE id = %s", (bike_id,))
            if not cur.fetchone():
                return error('Bike not found', status=404)
            cur.execute("UPDATE bikes SET is_active = 0 WHERE id = %s", (bike_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    # Soft-delete sets is_active=0 → regen will delete the HTML
    _regenerate_bike_html(bike_id)
    return success({'message': f'Bike {bike_id} deactivated'})


def release_reservation(bike_id: int, event=None):
    """Manually clear an active reservation on a bike (admin escape hatch).

    Refuses if bike is sold. Also refuses to release a 'processing' reservation
    by default — at that state the buyer's card is being authorized at Stripe
    and releasing creates a TOCTOU where another buyer can grab the bike, then
    the original buyer's payment also succeeds → race-lost auto-refund. For
    genuine emergencies, pass `force=true` in the body.
    """
    body = parse_body(event) if event else {}
    force = bool(body.get('force'))

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, sold, reservation_state, reservation_session_id, reserved_until
                FROM bikes
                WHERE id = %s
                """,
                (bike_id,)
            )
            bike = cur.fetchone()
            if not bike:
                return error('Bike not found', status=404)
            if bike['sold']:
                return error('Cannot release reservation on a sold bike', status=400)
            if bike['reservation_state'] in ('none', None):
                return error('Bike has no active reservation', status=400)
            if bike['reservation_state'] == 'processing' and not force:
                return error(
                    "Bike is in 'processing' state — buyer's card is being authorized. "
                    "Releasing now risks an automatic refund if their payment succeeds. "
                    "Pass force=true to release anyway.",
                    status=409
                )

            prev_state      = bike['reservation_state']
            prev_session_id = bike['reservation_session_id']

            # Clear the bike's reservation. WHERE sold=0 prevents flipping a
            # bike that got marked sold between our SELECT and this UPDATE.
            cur.execute(
                """
                UPDATE bikes
                SET reservation_state = 'none',
                    reserved_until = NULL,
                    reservation_session_id = NULL
                WHERE id = %s AND sold = 0
                """,
                (bike_id,)
            )
            if cur.rowcount == 0:
                return error('Bike state changed during release — please refresh and try again', status=409)

            # Mark the originating session as abandoned so it can't be reused.
            if prev_session_id:
                cur.execute(
                    "UPDATE checkout_sessions SET status = 'abandoned' WHERE id = %s AND status = 'active'",
                    (prev_session_id,)
                )

            # Audit log — release_reservation is the most dangerous admin action
            # (force=true on processing state can cost the original buyer an
            # auto-refund). Capture WHO did it, WHAT bike, FROM WHAT state, and
            # whether force was used. Best-effort: don't fail the release if the
            # audit insert errors (the action itself succeeded).
            actor_email = ''
            try:
                claims = (event or {}).get('requestContext', {}).get('authorizer', {}).get('claims', {}) or {}
                actor_email = claims.get('email') or claims.get('cognito:username') or ''
            except Exception:
                pass
            try:
                cur.execute(
                    """
                    INSERT INTO order_events
                      (order_id, event_type, message, created_at)
                    VALUES (
                      NULL,
                      'admin_release_reservation',
                      %s,
                      UTC_TIMESTAMP()
                    )
                    """,
                    (json.dumps({
                        'actor': actor_email,
                        'bike_id': bike_id,
                        'previous_state': prev_state,
                        'previous_session_id': prev_session_id,
                        'force': force,
                    }),)
                )
            except Exception as audit_err:
                # Don't roll back — the release succeeded. Just log.
                print(f"WARN: release_reservation audit log failed: {audit_err}")

        conn.commit()
        # Don't leak internal session IDs in the response.
        return success({
            'message': 'Reservation released',
            'bike_id': bike_id,
            'previous_state': prev_state,
        })
    except Exception:
        conn.rollback()
        raise


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# IMAGES
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def upload_image(bike_id: int, event):
    body = parse_body(event)

    filename     = body.get('filename', '').strip()
    content_type = body.get('content_type', 'image/jpeg').strip()
    if not filename:
        return error('filename is required', status=400)

    # Allowlist content types — must match what the admin frontend actually
    # uploads (BikeForm.jsx ACCEPTED_TYPES). This prevents an attacker (or
    # admin pasting a wrong content_type) from uploading text/html under a
    # .jpg filename and serving XSS from the images bucket. Keep this list
    # in sync with frontend/src/pages/admin/BikeForm.jsx ACCEPTED_TYPES.
    ALLOWED_CONTENT_TYPES = {
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime', 'video/mov',
    }
    if content_type not in ALLOWED_CONTENT_TYPES:
        return error(
            f"Unsupported content_type: {content_type}. Allowed: {sorted(ALLOWED_CONTENT_TYPES)}",
            status=400
        )

    # Sanitise filename
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    s3_key    = f"bikes/{bike_id}/{uuid.uuid4()}-{safe_name}"
    image_url = f"{IMAGES_CDN_BASE}/{s3_key}"

    s3 = boto3.client('s3', region_name=AWS_REGION)
    upload_url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket':       IMAGES_BUCKET,
            'Key':          s3_key,
            'ContentType':  content_type,
            # Filenames are UUIDs — content is effectively immutable. Long
            # cache makes CloudFront edge serve hits without revalidating.
            'CacheControl': 'public, max-age=31536000, immutable',
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
    )

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Get current max sort_order for this bike
            cur.execute(
                "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM bike_images WHERE bike_id = %s",
                (bike_id,)
            )
            max_sort = cur.fetchone()['max_sort']

            cur.execute(
                "INSERT INTO bike_images (bike_id, url, sort_order) VALUES (%s, %s, %s)",
                (bike_id, image_url, max_sort + 1)
            )
            image_id = cur.lastrowid
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return success({
        'upload_url': upload_url,
        'image_url':  image_url,
        'image_id':   image_id,
        's3_key':     s3_key,
        'expires_in': PRESIGNED_URL_EXPIRY_SECONDS,
    }, status=201)


def _s3_key_from_url(url: str) -> str:
    """
    Convert a stored image URL back to its S3 object key.
    Handles both the current CDN base (CloudFront) and the legacy direct
    S3 URLs that pre-existing rows still use until backfilled.
    URLs look like: https://<cdn-base>/bikes/<bike_id>/<uuid>-<filename>
    Returns '' if the URL doesn't sit under any known base.
    """
    if not url:
        return ''
    candidates = [
        IMAGES_CDN_BASE.rstrip('/') + '/' if IMAGES_CDN_BASE else None,
        # Legacy: direct S3 URLs from before the CloudFront migration
        'https://machx-cycles-images.s3.amazonaws.com/',
        'https://machx-cycles-images.s3.us-east-1.amazonaws.com/',
    ]
    for base in candidates:
        if base and url.startswith(base):
            return url[len(base):]
    return ''


def delete_image(bike_id: int, img_id: int):
    conn = get_connection()
    s3_key = ''
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, url FROM bike_images WHERE id = %s AND bike_id = %s",
                (img_id, bike_id)
            )
            row = cur.fetchone()
            if not row:
                return error('Image not found', status=404)
            s3_key = _s3_key_from_url(row.get('url', ''))
            cur.execute(
                "DELETE FROM bike_images WHERE id = %s AND bike_id = %s",
                (img_id, bike_id)
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    # Best-effort S3 cleanup. The DB is the source of truth — if S3 deletion
    # fails (network, permissions, key already gone) we still return success
    # so the admin UI doesn't show a misleading error.
    if s3_key:
        try:
            boto3.client('s3', region_name=AWS_REGION).delete_object(
                Bucket=IMAGES_BUCKET,
                Key=s3_key,
            )
        except Exception as exc:
            logger.warning("S3 cleanup failed for bike %s img %s key %s: %s",
                           bike_id, img_id, s3_key, exc)

    return success({'message': f'Image {img_id} removed'})


def reorder_images(bike_id: int, event):
    """
    Body: { "image_ids": [3, 1, 2] }  — full ordered list of image IDs for this bike.
    Updates bike_images.sort_order so the array order is reflected in queries.
    """
    body = parse_body(event) or {}
    ids  = body.get('image_ids')
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return error('image_ids must be an array of integers', status=400)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Verify every supplied id belongs to this bike, and that we have
            # the complete set (caller can't drop or add ids in a reorder).
            cur.execute(
                "SELECT id FROM bike_images WHERE bike_id = %s",
                (bike_id,)
            )
            existing = {row['id'] for row in cur.fetchall()}
            if set(ids) != existing:
                return error(
                    'image_ids must list every image for this bike exactly once',
                    status=400,
                )

            for sort_order, img_id in enumerate(ids):
                cur.execute(
                    "UPDATE bike_images SET sort_order = %s WHERE id = %s AND bike_id = %s",
                    (sort_order, img_id, bike_id),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return success({'message': f'Reordered {len(ids)} images'})


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# ORDERS
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def list_orders(event):
    params = get_query_params(event)
    page   = max(1, int(params.get('page',  1)))
    limit  = min(100, int(params.get('limit', 20)))
    offset = (page - 1) * limit

    where_clauses, args = [], []

    if params.get('status'):
        where_clauses.append("o.status = %s")
        args.append(params['status'])
    if params.get('payment_status'):
        where_clauses.append("o.payment_status = %s")
        args.append(params['payment_status'])
    if params.get('date_from'):
        where_clauses.append("DATE(o.created_at) >= %s")
        args.append(params['date_from'])
    if params.get('date_to'):
        where_clauses.append("DATE(o.created_at) <= %s")
        args.append(params['date_to'])
    if params.get('search'):
        where_clauses.append("(o.customer_email LIKE %s OR o.order_number LIKE %s)")
        args.extend([f"%{params['search']}%", f"%{params['search']}%"])

    where = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''

    conn = get_connection()
    with conn.cursor() as cur:
        # Total count
        cur.execute(f"SELECT COUNT(*) AS total FROM orders o {where}", args)
        total = cur.fetchone()['total']

        # Paginated results
        cur.execute(
            f"""
            SELECT
                o.*,
                COUNT(oi.id) AS item_count
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            {where}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT %s OFFSET %s
            """,
            args + [limit, offset]
        )
        orders = cur.fetchall()

    return success({
        'orders': orders,
        'total':  total,
        'page':   page,
        'pages':  max(1, -(-total // limit)),  # ceiling division
        'limit':  limit,
    })


def get_order(order_id: int):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
        order = cur.fetchone()
        if not order:
            return error('Order not found', status=404)

        cur.execute(
            """
            SELECT
                oi.id, oi.order_id, oi.bike_id, oi.quantity, oi.unit_price,
                b.name AS bike_name,
                b.slug AS bike_slug,
                b.frame_size,
                b.material
            FROM order_items oi
            JOIN bikes b ON b.id = oi.bike_id
            WHERE oi.order_id = %s
            """,
            (order_id,)
        )
        order['items'] = cur.fetchall()

        cur.execute(
            "SELECT * FROM order_events WHERE order_id = %s ORDER BY created_at ASC",
            (order_id,)
        )
        order['events'] = cur.fetchall()

    return success(order)


_VALID_CARRIERS = {'BIKEFLIGHTS', 'UPS', 'FEDEX', 'USPS', 'OTHER'}
_CARRIER_LABELS = {'BIKEFLIGHTS': 'BikeFlights', 'UPS': 'UPS', 'FEDEX': 'FedEx', 'USPS': 'USPS', 'OTHER': 'carrier'}

def _carrier_label(code: str) -> str:
    return _CARRIER_LABELS.get((code or '').upper(), code or 'carrier')


def update_order(order_id: int, event):
    body = parse_body(event)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
            existing = cur.fetchone()
            if not existing:
                return error('Order not found', status=404)

            set_parts, args = [], []
            shipping_event_msg = None

            if 'status' in body:
                set_parts.append("`status` = %s")
                args.append(body['status'])

            if 'notes' in body:
                set_parts.append("`notes` = %s")
                args.append(body['notes'])

            # Shipping fields — admin pastes tracking info here. When tracking
            # is set for the first time, we auto-flip status to 'shipped',
            # stamp shipped_at, and queue a customer notification email.
            if 'tracking_number' in body or 'tracking_carrier' in body or 'estimated_delivery' in body:
                tn = (body.get('tracking_number') or '').strip()
                tc = (body.get('tracking_carrier') or '').strip().upper()
                ed = body.get('estimated_delivery')  # YYYY-MM-DD or None

                # Validate carrier
                if tc and tc not in _VALID_CARRIERS:
                    return error(f'Invalid carrier. Must be one of: {", ".join(sorted(_VALID_CARRIERS))}', status=400)
                # Tracking number is required if a carrier is set, vice versa
                if (tn and not tc) or (tc and not tn):
                    return error('tracking_number and tracking_carrier must both be provided', status=400)

                # Allow clearing (empty string sets to NULL)
                set_parts.append("`tracking_number` = %s")
                args.append(tn or None)
                set_parts.append("`tracking_carrier` = %s")
                args.append(tc or None)

                if 'estimated_delivery' in body:
                    set_parts.append("`estimated_delivery` = %s")
                    args.append(ed if ed else None)

                # First-time-shipped auto-actions
                first_ship = tn and not existing.get('tracking_number')
                if first_ship:
                    set_parts.append("`shipped_at` = UTC_TIMESTAMP()")
                    if existing.get('status') in (None, 'pending', 'confirmed', 'processing'):
                        set_parts.append("`status` = 'shipped'")
                    # Tracking number is shown in its own UI card; no need to repeat in the message
                    shipping_event_msg = f"Shipped via {_carrier_label(tc)}"

            if not set_parts:
                return error('No valid fields to update', status=400)

            args.append(order_id)
            cur.execute(
                f"UPDATE orders SET {', '.join(set_parts)} WHERE id = %s",
                args
            )

            # Log status change event — but skip when a more specific event
            # (shipped) is also being logged in the same call. Avoids the
            # noisy "Status changed from confirmed to shipped" + "Shipped via UPS"
            # double entry that adds nothing for the customer or admin.
            if 'status' in body and body['status'] != existing['status']:
                if not (shipping_event_msg and body['status'] == 'shipped'):
                    _log_order_event(
                        cur, order_id, 'status_change',
                        f"Marked {body['status']}"
                    )

            if shipping_event_msg:
                _log_order_event(cur, order_id, 'shipped', shipping_event_msg)

        conn.commit()

        # Send customer email AFTER commit (best-effort, never breaks the save)
        if shipping_event_msg:
            _queue_shipped_email(order_id)

    except Exception:
        conn.rollback()
        raise

    return get_order(order_id)


def _queue_shipped_email(order_id: int):
    """Async-trigger the customer 'Your bike shipped' email via S3 regen-queue
    pattern (same one we use for bike HTML regen). The non-VPC sibling Lambda
    handles the Resend API call since admin-api can't reach the public
    internet from inside its VPC."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, order_number, customer_name, customer_email,
                          shipping_address, total, tracking_number, tracking_carrier,
                          estimated_delivery, shipped_at
                   FROM orders WHERE id = %s""",
                (order_id,)
            )
            order = cur.fetchone()
            cur.execute(
                """SELECT oi.unit_price, oi.quantity, b.name AS bike_name
                   FROM order_items oi LEFT JOIN bikes b ON b.id = oi.bike_id
                   WHERE oi.order_id = %s""",
                (order_id,)
            )
            items = cur.fetchall()
        if not order:
            return

        # JSON-safe convert
        payload_order = {}
        for k, v in order.items():
            if v is None:
                payload_order[k] = None
            elif hasattr(v, 'isoformat'):
                payload_order[k] = v.isoformat()
            elif isinstance(v, (int, float, bool, str)):
                payload_order[k] = v
            else:
                payload_order[k] = str(v)
        payload_items = []
        for it in items:
            payload_items.append({
                'bike_name': it.get('bike_name') or 'Bike',
                'quantity':  int(it.get('quantity', 1)),
                'unit_price': float(it.get('unit_price', 0)) if it.get('unit_price') is not None else 0,
            })

        s3 = boto3.client('s3', region_name=AWS_REGION)
        key = f"regen-queue/email-shipped-{order_id}-{int(datetime.utcnow().timestamp() * 1000)}.json"
        s3.put_object(
            Bucket='machx-cycles-frontend',
            Key=key,
            Body=json.dumps({
                'action': 'send_shipped_email',
                'order':  payload_order,
                'items':  payload_items,
            }).encode('utf-8'),
            ContentType='application/json',
        )
        print(f"_queue_shipped_email: queued shipped-email for order {order_id} via {key}")
    except Exception as e:
        print(f"_queue_shipped_email: failed for order {order_id}: {e}")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# PROMOTIONS
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def list_promotions():
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM promotions ORDER BY created_at DESC")
        promos = cur.fetchall()
    return success({'promotions': promos, 'total': len(promos)})


def create_promotion(event):
    body = parse_body(event)

    for field in ('name', 'discount_type', 'discount_value', 'start_date', 'end_date'):
        if not body.get(field) and body.get(field) != 0:
            return error(f'{field} is required', status=400)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO promotions
                    (name, description, discount_type, discount_value,
                     min_order_amount, applies_to, category_id, bike_id,
                     promo_code, start_date, end_date, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    body['name'],
                    body.get('description'),
                    body['discount_type'],
                    body['discount_value'],
                    body.get('min_order_amount'),
                    body.get('applies_to', 'all'),
                    body.get('category_id'),
                    body.get('bike_id'),
                    body.get('promo_code'),
                    body['start_date'],
                    body['end_date'],
                    int(body.get('is_active', 1)),
                )
            )
            promo_id = cur.lastrowid
            cur.execute("SELECT * FROM promotions WHERE id = %s", (promo_id,))
            promo = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return success(promo, status=201)


def update_promotion(promo_id: int, event):
    body = parse_body(event)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM promotions WHERE id = %s", (promo_id,))
            if not cur.fetchone():
                return error('Promotion not found', status=404)

            updatable  = [
                'name', 'description', 'discount_type', 'discount_value',
                'min_order_amount', 'applies_to', 'category_id', 'bike_id',
                'promo_code', 'start_date', 'end_date', 'is_active',
            ]
            set_parts, args = [], []
            for field in updatable:
                if field in body:
                    set_parts.append(f"`{field}` = %s")
                    args.append(body[field])

            if not set_parts:
                return error('No valid fields to update', status=400)

            args.append(promo_id)
            cur.execute(
                f"UPDATE promotions SET {', '.join(set_parts)} WHERE id = %s",
                args
            )
            cur.execute("SELECT * FROM promotions WHERE id = %s", (promo_id,))
            promo = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return success(promo)


def delete_promotion(promo_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM promotions WHERE id = %s", (promo_id,))
            if not cur.fetchone():
                return error('Promotion not found', status=404)
            cur.execute("DELETE FROM promotions WHERE id = %s", (promo_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return success({'message': f'Promotion {promo_id} deleted'})


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# DASHBOARD
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_dashboard():
    conn = get_connection()
    conn.commit()  # reset stale read
    
    # Only count real orders (paid, confirmed, shipped, delivered) - not pending/cancelled
    REAL_ORDER_STATUSES = ('paid', 'confirmed', 'processing', 'shipped', 'delivered')
    
    with conn.cursor() as cur:
        # Today's PAID orders only
        cur.execute(
            """
            SELECT
                COUNT(*) AS today_orders,
                COALESCE(SUM(total), 0) AS today_revenue
            FROM orders
            WHERE DATE(created_at) = CURDATE()
              AND payment_status = 'paid'
            """
        )
        today = cur.fetchone()

        # This month's PAID orders only
        cur.execute(
            """
            SELECT
                COUNT(*) AS month_orders,
                COALESCE(SUM(total), 0) AS month_revenue
            FROM orders
            WHERE YEAR(created_at) = YEAR(CURDATE())
              AND MONTH(created_at) = MONTH(CURDATE())
              AND payment_status = 'paid'
            """
        )
        month = cur.fetchone()

        # All-time total (paid only)
        cur.execute("SELECT COUNT(*) AS total_orders FROM orders WHERE payment_status = 'paid'")
        totals = cur.fetchone()
        
        # Pending orders (unpaid) - show separately
        cur.execute("SELECT COUNT(*) AS pending_orders FROM orders WHERE payment_status = 'pending'")
        pending = cur.fetchone()

        # Orders by status (all, for the breakdown)
        cur.execute(
            "SELECT status, COUNT(*) AS cnt FROM orders WHERE payment_status != 'unpaid' GROUP BY status"
        )
        by_status = {row['status']: row['cnt'] for row in cur.fetchall()}

        # Recent 5 PAID orders (real orders, not pending tests)
        cur.execute(
            """
            SELECT id, order_number, customer_name, total, status, payment_status, created_at
            FROM orders
            WHERE payment_status = 'paid'
            ORDER BY created_at DESC
            LIMIT 5
            """
        )
        recent_orders = cur.fetchall()

    return success({
        'today_orders':     today['today_orders'],
        'today_revenue':    float(today['today_revenue']),
        'month_orders':     month['month_orders'],
        'month_revenue':    float(month['month_revenue']),
        'total_orders':     totals['total_orders'],
        'pending_orders':   pending['pending_orders'],
        'orders_by_status': by_status,
        'recent_orders':    recent_orders,
    })


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# SETTINGS
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_settings():
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT key_name, value FROM site_settings")
        rows     = cur.fetchall()
        settings = {row['key_name']: row['value'] for row in rows}
    return success(settings)


def update_settings(event):
    body = parse_body(event)
    if not isinstance(body, dict) or not body:
        return error('Body must be a non-empty key-value object', status=400)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for key, value in body.items():
                cur.execute(
                    """
                    INSERT INTO site_settings (key_name, value)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                    """,
                    (key, str(value))
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return get_settings()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â