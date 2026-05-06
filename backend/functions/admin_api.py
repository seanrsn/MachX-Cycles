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

    try:
        return _route(method, path, event)
    except pymysql.Error as e:
        logger.exception("Database error")
        return error('Database error', status=500, details=str(e))
    except Exception as e:
        logger.exception("Unhandled exception")
        return error('Internal server error', status=500, details=str(e))


def _route(method, path, event):
    # Bikes collection
    if _RE_BIKES.match(path):
        if method == 'GET':  return list_bikes(event)
        if method == 'POST': return create_bike(event)

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

    return error(f'Route not found: {method} {path}', status=404)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Helpers
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _slugify(text: str) -> str:
    """Convert a string to a URL-safe slug."""
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower())
    return slug.strip('-')


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


def _log_order_event(cur, order_id: int, event_type: str, message: str, metadata: dict = None):
    cur.execute(
        """
        INSERT INTO order_events (order_id, event_type, message, metadata)
        VALUES (%s, %s, %s, %s)
        """,
        (order_id, event_type, message, json.dumps(metadata) if metadata else None)
    )


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
                     material, weight, brand, model_year, specs, featured, is_active, sold)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    body['category_id'],
                    body['name'],
                    slug,
                    body.get('description'),
                    body['base_price'],
                    body.get('msrp'),  # original retail price
                    body.get('material'),
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

        return get_bike(bike_id)  # re-fetch and return full record
    except Exception:
        conn.rollback()
        raise


def update_bike(bike_id: int, event):
    body = parse_body(event)
    if not body:
        return error('No fields to update', status=400)

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
                         'material', 'weight', 'brand', 'model_year', 'featured', 'is_active', 'sold']
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
    return success({'message': f'Bike {bike_id} deactivated'})


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# IMAGES
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def upload_image(bike_id: int, event):
    body = parse_body(event)

    filename     = body.get('filename', '').strip()
    content_type = body.get('content_type', 'image/jpeg').strip()
    if not filename:
        return error('filename is required', status=400)

    # Sanitise filename
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    s3_key    = f"bikes/{bike_id}/{uuid.uuid4()}-{safe_name}"
    image_url = f"{IMAGES_CDN_BASE}/{s3_key}"

    s3 = boto3.client('s3', region_name=AWS_REGION)
    upload_url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket':      IMAGES_BUCKET,
            'Key':         s3_key,
            'ContentType': content_type,
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


def delete_image(bike_id: int, img_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM bike_images WHERE id = %s AND bike_id = %s",
                (img_id, bike_id)
            )
            if not cur.fetchone():
                return error('Image not found', status=404)
            cur.execute(
                "DELETE FROM bike_images WHERE id = %s AND bike_id = %s",
                (img_id, bike_id)
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
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
                oi.*,
                b.name AS bike_name,
                b.slug AS bike_slug
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

            if 'status' in body:
                set_parts.append("`status` = %s")
                args.append(body['status'])

            if 'notes' in body:
                set_parts.append("`notes` = %s")
                args.append(body['notes'])

            if not set_parts:
                return error('No valid fields to update', status=400)

            args.append(order_id)
            cur.execute(
                f"UPDATE orders SET {', '.join(set_parts)} WHERE id = %s",
                args
            )

            # Log status change event
            if 'status' in body and body['status'] != existing['status']:
                _log_order_event(
                    cur, order_id, 'status_change',
                    f"Status changed from {existing['status']} to {body['status']}"
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return get_order(order_id)


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