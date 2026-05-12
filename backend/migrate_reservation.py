"""Migration: phase-based bike reservation system.

Replaces the previous "flip sold=1 at webhook time" approach with a state
machine that tracks reservations through the full Stripe lifecycle:

  none -> soft (cart, 5 min TTL)
       -> pi_created (Stripe PI created, 30 min TTL)
       -> processing (Stripe says payment in flight, permanent lock)
       -> sold

This prevents the race where two buyers can both pay for the same 1-of-1 bike
because the reservation extends as the buyer progresses through Stripe-validated
milestones (not client-side time alone).
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
    read_timeout=30,
)

print("Connected.", flush=True)

try:
    with conn.cursor() as cur:
        # 1. reservation_state column
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'reservation_state'")
        if cur.fetchone():
            print("Column 'reservation_state' already exists.", flush=True)
        else:
            cur.execute("""
                ALTER TABLE bikes
                ADD COLUMN reservation_state
                  ENUM('none','soft','pi_created','processing','sold')
                  NOT NULL DEFAULT 'none'
                  AFTER sold
            """)
            conn.commit()
            print("Added 'reservation_state' column.", flush=True)

        # 2. reserved_until column
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'reserved_until'")
        if cur.fetchone():
            print("Column 'reserved_until' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE bikes ADD COLUMN reserved_until DATETIME DEFAULT NULL AFTER reservation_state")
            conn.commit()
            print("Added 'reserved_until' column.", flush=True)

        # 3. reservation_order_id column
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'reservation_order_id'")
        if cur.fetchone():
            print("Column 'reservation_order_id' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE bikes ADD COLUMN reservation_order_id INT DEFAULT NULL AFTER reserved_until")
            conn.commit()
            print("Added 'reservation_order_id' column.", flush=True)

        # 4. Index for the reservation lookup query
        cur.execute("SHOW INDEX FROM bikes WHERE Key_name = 'idx_bikes_reservation'")
        if cur.fetchone():
            print("Index 'idx_bikes_reservation' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE bikes ADD INDEX idx_bikes_reservation (reservation_state, reserved_until)")
            conn.commit()
            print("Added reservation index.", flush=True)

        # 5. Backfill: any existing sold bikes get reservation_state='sold' for consistency
        cur.execute("UPDATE bikes SET reservation_state = 'sold' WHERE sold = 1 AND reservation_state = 'none'")
        if cur.rowcount > 0:
            conn.commit()
            print(f"Backfilled reservation_state='sold' on {cur.rowcount} sold bikes.", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("Done.", flush=True)
