"""Migration: introduce checkout_sessions; orders becomes paid-only.

Before:
  POST /checkout creates an `orders` row with payment_status='unpaid'.
  Stripe webhook flips payment_status='paid' on succeeded.
  Result: orders table contains both real orders AND every abandoned attempt.

After:
  POST /checkout creates a `checkout_sessions` row (in-flight only).
  Stripe webhook materializes session into a real `orders` + `order_items` row.
  Result: orders table only contains paid (or refunded) real orders.

Reservations now point at session_id, not order_id, while a checkout is in
flight. After materialization, the bike is `sold=1` and reservation is cleared.
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
        # 1. checkout_sessions table
        cur.execute("SHOW TABLES LIKE 'checkout_sessions'")
        if cur.fetchone():
            print("Table 'checkout_sessions' already exists.", flush=True)
        else:
            cur.execute("""
                CREATE TABLE checkout_sessions (
                    id                       int           NOT NULL AUTO_INCREMENT,
                    session_token            varchar(64)   NOT NULL,
                    buyer_token              varchar(64),
                    customer_email           varchar(255)  NOT NULL,
                    customer_name            varchar(200)  NOT NULL,
                    customer_phone           varchar(20),
                    shipping_address         json          NOT NULL,
                    shipping_rate_id         int,
                    shipping_fee             decimal(10,2) DEFAULT 0.00,
                    subtotal                 decimal(10,2) NOT NULL,
                    discount_amount          decimal(10,2) DEFAULT 0.00,
                    total                    decimal(10,2) NOT NULL,
                    promo_code               varchar(50),
                    items                    json          NOT NULL,
                    stripe_payment_intent_id varchar(255),
                    status                   enum('active','converted','abandoned','expired') DEFAULT 'active',
                    converted_to_order_id    int,
                    expires_at               datetime,
                    created_at               datetime DEFAULT CURRENT_TIMESTAMP,
                    updated_at               datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uk_session_token (session_token),
                    KEY idx_session_buyer_token (buyer_token),
                    KEY idx_session_pi (stripe_payment_intent_id),
                    KEY idx_session_status (status),
                    KEY idx_session_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            conn.commit()
            print("Created checkout_sessions table.", flush=True)

        # 2. Rename bikes.reservation_order_id -> bikes.reservation_session_id
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'reservation_session_id'")
        if cur.fetchone():
            print("Column 'reservation_session_id' already exists.", flush=True)
        else:
            cur.execute("SHOW COLUMNS FROM bikes LIKE 'reservation_order_id'")
            if cur.fetchone():
                # First clear any active reservations (they reference orders that
                # will be cleaned up below)
                cur.execute(
                    "UPDATE bikes SET reservation_state='none', reserved_until=NULL, reservation_order_id=NULL WHERE sold=0"
                )
                conn.commit()
                cur.execute(
                    "ALTER TABLE bikes CHANGE reservation_order_id reservation_session_id INT DEFAULT NULL"
                )
                conn.commit()
                print("Renamed reservation_order_id -> reservation_session_id.", flush=True)
            else:
                cur.execute("ALTER TABLE bikes ADD COLUMN reservation_session_id INT DEFAULT NULL AFTER reserved_until")
                conn.commit()
                print("Added reservation_session_id column.", flush=True)

        # 2b. Add order_number column for direct lookup (lets customers find
        #     their pending order before the webhook materializes it).
        cur.execute("SHOW COLUMNS FROM checkout_sessions LIKE 'order_number'")
        if cur.fetchone():
            print("Column 'checkout_sessions.order_number' already exists.", flush=True)
        else:
            cur.execute("ALTER TABLE checkout_sessions ADD COLUMN order_number VARCHAR(30) AFTER session_token")
            cur.execute("ALTER TABLE checkout_sessions ADD UNIQUE KEY uk_session_order_number (order_number)")
            conn.commit()
            print("Added order_number column to checkout_sessions.", flush=True)

        # 3. Clean up the orders table: delete every unpaid draft.
        # Also nukes order_items and order_events for those orders via FK ON DELETE CASCADE.
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM orders WHERE payment_status = 'unpaid'"
        )
        cnt = cur.fetchone()['cnt']
        if cnt > 0:
            cur.execute("DELETE FROM orders WHERE payment_status = 'unpaid'")
            conn.commit()
            print(f"Deleted {cnt} unpaid draft orders (and their items / events via cascade).", flush=True)
        else:
            print("No unpaid drafts to clean up.", flush=True)

        # 4. Show what's left for sanity
        cur.execute("SELECT id, order_number, payment_status, status, total FROM orders ORDER BY id")
        rows = cur.fetchall()
        print(f"\\nRemaining orders ({len(rows)}):", flush=True)
        for r in rows:
            print(f"  #{r['id']} {r['order_number']} | {r['payment_status']} / {r['status']} | ${r['total']}", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
    raise
finally:
    conn.close()
    print("\\nDone.", flush=True)
