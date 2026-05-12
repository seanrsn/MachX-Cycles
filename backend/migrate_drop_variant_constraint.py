"""Migration: drop the legacy variant_id NOT NULL + FK constraint on order_items.

The bike_variants table is being deprecated (1-of-1 bike model). Orders no
longer reference variants, only bikes — but the schema still required a valid
variant_id on every order_items row, blocking all inserts.

This makes variant_id nullable and drops the FK constraint so existing data
isn't lost but new inserts work. The column stays around for now in case any
historical reads still reference it.
"""
import json
import boto3
import pymysql

secrets = boto3.client('secretsmanager', region_name='us-east-1')
creds = json.loads(secrets.get_secret_value(SecretId='machx-db-credentials')['SecretString'])

print(f"Connecting to {creds['host']}...", flush=True)

conn = pymysql.connect(
    host=creds['host'],
    user=creds['username'],
    password=creds['password'],
    database='machx_cycles',
    cursorclass=pymysql.cursors.DictCursor,
    connect_timeout=10,
    read_timeout=60,
)

print("Connected.", flush=True)

try:
    with conn.cursor() as cur:
        # 1. Drop the FK constraint (must come before dropping the index)
        cur.execute("""
            SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = 'machx_cycles'
              AND TABLE_NAME = 'order_items'
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND CONSTRAINT_NAME = 'fk_order_items_variant'
        """)
        if cur.fetchone():
            cur.execute("ALTER TABLE order_items DROP FOREIGN KEY fk_order_items_variant")
            conn.commit()
            print("Dropped FK constraint fk_order_items_variant.", flush=True)
        else:
            print("FK fk_order_items_variant already gone.", flush=True)

        # 2. Make variant_id nullable
        cur.execute("SHOW COLUMNS FROM order_items LIKE 'variant_id'")
        col = cur.fetchone()
        if col and col['Null'] == 'NO':
            cur.execute("ALTER TABLE order_items MODIFY COLUMN variant_id INT DEFAULT NULL")
            conn.commit()
            print("Made variant_id nullable.", flush=True)
        else:
            print("variant_id already nullable (or column gone).", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("Done.", flush=True)
