"""Migration: drop the variant system entirely.

After the 1-of-1 bike refactor, none of these are referenced:
  - order_items.variant_id     (already nullable, drops the column)
  - order_items.frame_size     (denormalized; use bikes.frame_size via JOIN)
  - order_items.color          (variant attribute, not relevant for 1-of-1)
  - bike_variants table         (legacy variant catalog)
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


def drop_column(cur, table, col):
    cur.execute(f"SHOW COLUMNS FROM {table} LIKE %s", (col,))
    if cur.fetchone():
        cur.execute(f"ALTER TABLE {table} DROP COLUMN {col}")
        print(f"  Dropped {table}.{col}", flush=True)
    else:
        print(f"  {table}.{col} already gone", flush=True)


try:
    with conn.cursor() as cur:
        # Kill any zombie connections first — they'd block the ALTERs
        cur.execute("SHOW PROCESSLIST")
        for p in cur.fetchall():
            if p.get('User') == 'admin' and (p.get('Time') or 0) > 60 and p.get('Id') != cur.connection.thread_id():
                try:
                    cur.execute(f"KILL {p['Id']}")
                    print(f"  Killed zombie {p['Id']} ({p['Time']}s)", flush=True)
                except Exception:
                    pass

        print("\\nDropping legacy columns from order_items...", flush=True)
        drop_column(cur, 'order_items', 'variant_id')
        drop_column(cur, 'order_items', 'frame_size')
        drop_column(cur, 'order_items', 'color')
        conn.commit()

        print("\\nDropping bike_variants table...", flush=True)
        cur.execute("SHOW TABLES LIKE 'bike_variants'")
        if cur.fetchone():
            cur.execute("DROP TABLE bike_variants")
            conn.commit()
            print("  Dropped bike_variants table", flush=True)
        else:
            print("  bike_variants already gone", flush=True)

        print("\\nFinal schema check:", flush=True)
        cur.execute("DESCRIBE order_items")
        cols = [r['Field'] for r in cur.fetchall()]
        print(f"  order_items columns: {cols}", flush=True)
        cur.execute("SHOW TABLES")
        tables = [list(r.values())[0] for r in cur.fetchall()]
        print(f"  tables: {sorted(tables)}", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("\\nDone.", flush=True)
