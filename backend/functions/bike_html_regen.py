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


# ─────────────────────────────────────────────────────────────────────────────
# SHIPPED-EMAIL via Resend
# ─────────────────────────────────────────────────────────────────────────────

import urllib.request
import urllib.error
from html import escape as html_escape

RESEND_FROM = 'MachX Cycles <hello@machxcycles.com>'
_RESEND_KEY = None

def _get_resend_key():
    global _RESEND_KEY
    if _RESEND_KEY is None:
        try:
            sm = boto3.client('secretsmanager', region_name='us-east-1')
            resp = sm.get_secret_value(SecretId='machx-resend-key')
            _RESEND_KEY = json.loads(resp['SecretString'])['api_key']
        except Exception as e:
            print(f"[shipped-email] cannot fetch Resend key: {e}")
            return None
    return _RESEND_KEY


_TRACKING_URLS = {
    'BIKEFLIGHTS': 'https://www.bikeflights.com/track?tracking={n}',
    'UPS':         'https://www.ups.com/track?tracknum={n}',
    'FEDEX':       'https://www.fedex.com/fedextrack/?trknbr={n}',
    'USPS':        'https://tools.usps.com/go/TrackConfirmAction?tLabels={n}',
    'OTHER':       None,
}

def _carrier_label(c):
    return {'BIKEFLIGHTS':'BikeFlights','UPS':'UPS','FEDEX':'FedEx','USPS':'USPS','OTHER':'Carrier'}.get(c, c or 'Carrier')


def _send_shipped_email(payload):
    """Send the customer 'Your bike shipped' email via Resend."""
    try:
        order = payload.get('order') or {}
        items = payload.get('items') or []
        to_email = (order.get('customer_email') or '').strip()
        if not to_email:
            return {'ok': False, 'reason': 'no_email'}

        api_key = _get_resend_key()
        if not api_key:
            return {'ok': False, 'reason': 'no_resend_key'}

        order_number = order.get('order_number') or ''
        customer = order.get('customer_name') or 'there'
        carrier = (order.get('tracking_carrier') or 'OTHER').upper()
        tracking_number = order.get('tracking_number') or ''
        carrier_label = _carrier_label(carrier)
        url_template = _TRACKING_URLS.get(carrier)
        tracking_url = url_template.replace('{n}', tracking_number) if url_template else None
        est = order.get('estimated_delivery')

        items_html = ''.join(
            f'<li style="margin:6px 0;">{html_escape(it["bike_name"])}'
            + (f' &times; {it["quantity"]}' if it.get("quantity", 1) > 1 else '')
            + '</li>'
            for it in items
        )

        track_button_html = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 16px 0;">'
            f'<tr><td align="center"><a href="{html_escape(tracking_url)}" style="display:inline-block;background:linear-gradient(135deg,#ec4899 0%,#f97316 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Track with {html_escape(carrier_label)} &rarr;</a></td></tr></table>'
        ) if tracking_url else ''

        est_html = f'<p style="margin:8px 0 0 0;color:#374151;font-size:14px;"><strong>Estimated delivery:</strong> {html_escape(est)}</p>' if est else ''

        html_body = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="background:linear-gradient(135deg,#ec4899 0%,#f97316 100%);padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.01em;">MachX Cycles</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111827;">Your bike is on the way, {html_escape(customer.split()[0] if customer else 'there')}!</h2>
          <p style="margin:0 0 20px 0;color:#6b7280;font-size:14px;">We just dropped off your order with {html_escape(carrier_label)}.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:16px;margin:0 0 20px 0;">
            <tr><td>
              <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Order</p>
              <p style="margin:4px 0 12px 0;color:#111827;font-size:16px;font-weight:700;font-family:'SF Mono',Menlo,monospace;">{html_escape(order_number)}</p>
              <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Tracking number</p>
              <p style="margin:4px 0 0 0;color:#111827;font-size:16px;font-weight:700;font-family:'SF Mono',Menlo,monospace;">{html_escape(tracking_number)}</p>
              {est_html}
            </td></tr>
          </table>
          {('<h3 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">In this shipment</h3><ul style="margin:0 0 20px 0;padding-left:20px;color:#374151;font-size:15px;">' + items_html + '</ul>') if items_html else ''}
          {track_button_html}
          <p style="margin:24px 0 0 0;color:#6b7280;font-size:13px;line-height:1.5;">Want to check status anytime? Use your email and order number <strong style="color:#111827;font-family:'SF Mono',Menlo,monospace;">{html_escape(order_number)}</strong> at <a href="https://machxcycles.com/track-order" style="color:#ec4899;text-decoration:none;">machxcycles.com/track-order</a>.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Just reply to this email.</p>
          <p style="margin:8px 0 0 0;color:#9ca3af;font-size:12px;">MachX Cycles &middot; Brooklyn Bikery &middot; 3149 Emmons Ave, Brooklyn, NY 11235</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""

        text_body = (
            f"Your bike is on the way, {customer.split()[0] if customer else 'there'}!\n\n"
            f"Order: {order_number}\n"
            f"Tracking: {tracking_number} ({carrier_label})\n"
            f"{('Estimated delivery: ' + est + chr(10)) if est else ''}\n"
            + (f"Track with {carrier_label}: {tracking_url}\n\n" if tracking_url else '')
            + f"Or check status at: https://machxcycles.com/track-order\n\n"
            f"Questions? Reply to this email.\n\n"
            f"- MachX Cycles\n"
            f"3149 Emmons Ave, Brooklyn, NY 11235"
        )

        payload_json = json.dumps({
            'from':     RESEND_FROM,
            'to':       [to_email],
            'subject':  f'Your bike is on the way! - {order_number}',
            'html':     html_body,
            'text':     text_body,
            'reply_to': 'hello@machxcycles.com',
            'headers':  {'X-Entity-Ref-ID': order_number},
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.resend.com/emails',
            data=payload_json,
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read().decode('utf-8')
            print(f"[shipped-email] sent for order {order_number}: {body[:200]}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='ignore')[:300]
            print(f"[shipped-email] HTTP {e.code} for order {order_number}: {err_body}")
            return {'ok': False, 'reason': 'send_failed'}
        return {'ok': True, 'action': 'shipped_email_sent'}
    except Exception as e:
        print(f"[shipped-email] crashed: {e}")
        return {'ok': False, 'reason': 'crash'}


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
    """Run the right action for a single payload. Returns dict result."""
    action = payload.get('action', 'upsert')
    if action == 'send_shipped_email':
        return _send_shipped_email(payload)
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
