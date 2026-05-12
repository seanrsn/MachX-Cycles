import json
import re
from difflib import SequenceMatcher
from shared.db import get_connection
from shared.response import success, error


# ─── Fuzzy search helpers ─────────────────────────────────────────────────────

def _token_similarity(a, b):
    """Similarity ratio between two strings (0–1)."""
    return SequenceMatcher(None, a, b).ratio()

def fuzzy_match_bikes(search_query, conn):
    """
    Fetch all active bike names and return IDs that fuzzy-match the query.

    Matching rules (all query tokens must match):
      - Substring match  : token appears inside a name word (or vice versa)
      - Fuzzy match      : SequenceMatcher ratio >= 0.75 against any name word

    Examples:
      'trek domein'  → matches 'Trek Domain'   (domain~domein ≈0.92)
      'kanondale'    → matches 'Cannondale'     (kanondale~cannondale ≈0.82)
      'canondale'    → matches 'Cannondale'     (≈0.90)
    """
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM bikes WHERE is_active = 1")
        all_bikes = cur.fetchall()

    query_tokens = search_query.lower().split()
    matched_ids = []

    for bike in all_bikes:
        name_tokens = bike['name'].lower().split()
        all_match = True

        for qt in query_tokens:
            token_matched = False
            for nt in name_tokens:
                # Substring in either direction
                if qt in nt or nt in qt:
                    token_matched = True
                    break
                # Fuzzy similarity
                if _token_similarity(qt, nt) >= 0.75:
                    token_matched = True
                    break
            if not token_matched:
                all_match = False
                break

        if all_match:
            matched_ids.append(bike['id'])

    return matched_ids

# Match anything after /bikes/. get_bike does the slug lookup — pure-numeric
# inputs and id-prefixed slugs get 404'd because slugs are never bare numbers.
_RE_BIKE = re.compile(r'^/bikes/([A-Za-z0-9_\-]+)$')


def handler(event, context):
    path   = event.get('path', '').rstrip('/')
    method = event.get('httpMethod', 'GET').upper()

    if method == 'OPTIONS':
        return success({})

    # GET /categories
    if path == '/categories':
        return get_categories()

    # GET /sizes
    if path == '/sizes':
        return get_sizes()

    # GET /shipping-rates
    if path == '/shipping-rates':
        return get_shipping_rates()

    # GET /sitemap.xml
    if path == '/sitemap.xml':
        return get_sitemap()

    # GET /bikes/{slug} (or legacy /bikes/{id} or /bikes/{id}-{slug})
    m = _RE_BIKE.match(path)
    if m:
        return get_bike(m.group(1))

    # GET /bikes
    if path == '/bikes':
        params = event.get('queryStringParameters') or {}
        return get_bikes(params)

    return error('Not found', status=404)


def get_sitemap():
    """Dynamic sitemap.xml — always reflects live inventory. Sold/inactive
    bikes are excluded automatically so we don't waste crawl budget."""
    BASE = 'https://machxcycles.com'

    static_urls = [
        ('/',             '1.0', 'daily'),
        ('/shop',         '0.9', 'daily'),
        ('/about',        '0.5', 'monthly'),
        ('/contact',      '0.5', 'monthly'),
        ('/support',      '0.5', 'monthly'),
        ('/track-order',  '0.3', 'monthly'),
    ]

    conn = get_connection()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, slug, updated_at FROM bikes "
            "WHERE is_active = 1 AND sold = 0 "
            "ORDER BY updated_at DESC"
        )
        bikes = cur.fetchall()
        cur.execute(
            "SELECT id, slug FROM categories ORDER BY sort_order ASC"
        )
        categories = cur.fetchall()

    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for path, priority, freq in static_urls:
        parts.append(f'<url><loc>{BASE}{path}</loc><changefreq>{freq}</changefreq><priority>{priority}</priority></url>')

    for cat in categories:
        parts.append(f'<url><loc>{BASE}/shop?category={cat["id"]}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>')

    for b in bikes:
        slug = (b.get('slug') or '').strip()
        if not slug:
            continue  # bikes without slugs aren't indexable in slug-only mode
        url = f'{BASE}/bikes/{slug}'
        lastmod = b['updated_at'].strftime('%Y-%m-%d') if b.get('updated_at') else ''
        lastmod_tag = f'<lastmod>{lastmod}</lastmod>' if lastmod else ''
        parts.append(f'<url><loc>{url}</loc>{lastmod_tag}<changefreq>weekly</changefreq><priority>0.8</priority></url>')

    parts.append('</urlset>')
    body = '\n'.join(parts)

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
        },
        'body': body,
    }


def get_categories():
    conn = get_connection()
    conn.commit()  # reset any open implicit transaction → always read latest committed data
    with conn.cursor() as cur:
        cur.execute("SELECT id, name, description FROM categories ORDER BY name")
        rows = cur.fetchall()
    return success({'categories': rows})


def get_shipping_rates():
    conn = get_connection()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, price, estimated_days "
            "FROM shipping_rates WHERE is_active = 1 ORDER BY price ASC"
        )
        rows = cur.fetchall()
    return success({'shipping_rates': rows})


def get_sizes():
    # Canonical size catalog. Mirrors frontend/src/constants/sizes.js — keep in sync.
    sizes = [
        {'code': 'XS',   'label': 'XS',       'frame': '48cm', 'min_height': "4'11\"", 'max_height': "5'2\""},
        {'code': 'S',    'label': 'Small',    'frame': '50cm', 'min_height': "5'2\"",  'max_height': "5'5\""},
        {'code': 'S/M',  'label': 'Small/M',  'frame': '52cm', 'min_height': "5'5\"",  'max_height': "5'7\""},
        {'code': 'M',    'label': 'Medium',   'frame': '54cm', 'min_height': "5'7\"",  'max_height': "5'10\""},
        {'code': 'L',    'label': 'Large',    'frame': '56cm', 'min_height': "5'10\"", 'max_height': "6'1\""},
        {'code': 'L/XL', 'label': 'Large/XL', 'frame': '58cm', 'min_height': "6'1\"",  'max_height': "6'3\""},
        {'code': 'XL',   'label': 'XL',       'frame': '60cm', 'min_height': "6'3\"",  'max_height': "6'5\""},
    ]
    return success({'sizes': sizes})


def get_bikes(params):
    category_id = params.get('category_id')
    featured    = params.get('featured')
    search      = (params.get('search') or '').strip()
    size        = (params.get('size') or '').strip()
    sort        = (params.get('sort') or '').strip()
    min_price   = (params.get('min_price') or '').strip()
    max_price   = (params.get('max_price') or '').strip()
    page        = max(1, int(params.get('page',  1)  or 1))
    limit       = min(48, max(1, int(params.get('limit', 12) or 12)))
    offset      = (page - 1) * limit

    price_expr = "b.base_price"

    conditions = ['b.is_active = 1', 'b.sold = 0']
    args = []

    # Get connection early so fuzzy search can reuse it
    conn = get_connection()
    conn.commit()

    if category_id:
        conditions.append('b.category_id = %s')
        args.append(int(category_id))
    if featured and str(featured) in ('1', 'true'):
        conditions.append('b.featured = 1')
    if search:
        matched_ids = fuzzy_match_bikes(search, conn)
        if not matched_ids:
            return success({'bikes': [], 'total': 0, 'page': page, 'pages': 1})
        placeholders = ','.join(['%s'] * len(matched_ids))
        conditions.append(f'b.id IN ({placeholders})')
        args.extend(matched_ids)
    if size:
        conditions.append('b.frame_size = %s')
        args.append(size)
    if min_price:
        try:
            conditions.append(f'({price_expr}) >= %s')
            args.append(float(min_price))
        except ValueError:
            pass
    if max_price:
        try:
            conditions.append(f'({price_expr}) <= %s')
            args.append(float(max_price))
        except ValueError:
            pass

    # Sort order
    if sort == 'price_asc':
        order_by = f'({price_expr}) ASC'
    elif sort == 'price_desc':
        order_by = f'({price_expr}) DESC'
    elif sort == 'newest':
        order_by = 'b.created_at DESC'
    else:
        order_by = 'b.featured DESC, b.created_at DESC'

    where = ' AND '.join(conditions)

    with conn.cursor() as cur:
        # Total count
        cur.execute(f"SELECT COUNT(*) AS cnt FROM bikes b WHERE {where}", args)
        total = cur.fetchone()['cnt']

        # Bikes with first image
        cur.execute(f"""
            SELECT b.id, b.slug, b.name, b.description, b.base_price, b.msrp, b.brand,
                   b.material, b.frame_size, b.condition_grade, b.weight, b.model_year,
                   b.featured, b.is_active, b.category_id, b.sold,
                   c.name AS category_name,
                   (SELECT bi.url FROM bike_images bi WHERE bi.bike_id = b.id
                    ORDER BY bi.sort_order ASC LIMIT 1) AS first_image_url
            FROM bikes b
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE {where}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """, args + [limit, offset])
        bikes = cur.fetchall()

    # Shape images array (single image for listing)
    for b in bikes:
        img = b.pop('first_image_url', None)
        b['images'] = [{'url': img}] if img else []

    return success({
        'bikes': bikes,
        'total': total,
        'page':  page,
        'pages': max(1, -(-total // limit)),  # ceiling div
    })


def get_bike(slug):
    """Look up a bike by its slug. Bare numeric IDs and id-prefixed forms
    are not supported — slug is the canonical identifier."""
    conn = get_connection()
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT b.id, b.slug, b.name, b.description, b.base_price, b.msrp, b.brand,
                   b.material, b.frame_size, b.condition_grade, b.weight, b.model_year,
                   b.featured, b.is_active, b.category_id, b.sold,
                   c.name AS category_name
            FROM bikes b
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.slug = %s AND b.is_active = 1
        """, (slug,))
        bike = cur.fetchone()
        if not bike:
            return error('Bike not found', status=404)

        cur.execute(
            "SELECT id, url, sort_order FROM bike_images WHERE bike_id = %s ORDER BY sort_order ASC",
            (bike['id'],)
        )
        bike['images'] = cur.fetchall()

    return success(bike)
