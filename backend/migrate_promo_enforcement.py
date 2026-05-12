"""Migration: add usage_count + max_uses to promotions table.

Lets us atomically enforce per-promo usage caps. Until this column existed,
a leaked promo code was unlimited-use forever — even if it had a "100 uses"
business intent there was nowhere to track it.
"""
import json
import boto3
import pymysql

secrets = boto3.client('secretsmanager', region_name='us-east-1')
creds = json.loads(secrets.get_secret_value(SecretId='machx-db-credentials')['SecretString'])

print(f"Connecting to {creds['host']}...", flush=True)
conn = pymysql.connect(
    host=creds['host'], user=creds['username'], password=creds['password'],
    database='machx_cycles', cursorclass=pymysql.cursors.DictCursor,
    connect_timeout=10, read_timeout=60,
)
print("Connected.", flush=True)

try:
    with conn.cursor() as cur:
        cur.execute("SHOW COLUMNS FROM promotions LIKE 'usage_count'")
        if cur.fetchone():
            print("Column 'usage_count' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE promotions ADD COLUMN usage_count INT NOT NULL DEFAULT 0 AFTER is_active")
            conn.commit()
            print("Added usage_count column.", flush=True)

        cur.execute("SHOW COLUMNS FROM promotions LIKE 'max_uses'")
        if cur.fetchone():
            print("Column 'max_uses' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE promotions ADD COLUMN max_uses INT DEFAULT NULL AFTER usage_count")
            conn.commit()
            print("Added max_uses column.", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("Done.", flush=True)
