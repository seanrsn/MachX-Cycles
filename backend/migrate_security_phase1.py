"""Migration: security phase 1
- Adds processed_stripe_events table for webhook idempotency
- Widens orders.order_number from varchar(20) to varchar(30) so we can fit
  longer (10-hex) suffix that defeats brute-force enumeration
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
    read_timeout=15,
)

print("Connected.", flush=True)

try:
    with conn.cursor() as cur:
        # 1. processed_stripe_events table for webhook idempotency
        cur.execute("SHOW TABLES LIKE 'processed_stripe_events'")
        if cur.fetchone():
            print("Table 'processed_stripe_events' already exists.", flush=True)
        else:
            cur.execute("""
                CREATE TABLE processed_stripe_events (
                    event_id      VARCHAR(255) NOT NULL,
                    event_type    VARCHAR(100),
                    processed_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (event_id),
                    KEY idx_processed_at (processed_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            conn.commit()
            print("Created 'processed_stripe_events' table.", flush=True)

        # 2. Widen orders.order_number column
        cur.execute("SHOW COLUMNS FROM orders LIKE 'order_number'")
        col = cur.fetchone()
        if col and col['Type'].lower() == 'varchar(30)':
            print("Column 'orders.order_number' already varchar(30).", flush=True)
        else:
            cur.execute("ALTER TABLE orders MODIFY COLUMN order_number VARCHAR(30) NOT NULL")
            conn.commit()
            print("Widened 'orders.order_number' to VARCHAR(30).", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("Done.", flush=True)
