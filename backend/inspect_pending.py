"""Inspect and optionally delete orders with payment_status = 'pending'."""
import json
import boto3
import pymysql

secrets = boto3.client('secretsmanager', region_name='us-east-1')
creds = json.loads(secrets.get_secret_value(SecretId='machx-db-credentials')['SecretString'])

conn = pymysql.connect(
    host=creds['host'],
    user=creds['username'],
    password=creds['password'],
    database='machx_cycles',
    cursorclass=pymysql.cursors.DictCursor
)

try:
    with conn.cursor() as cur:
        # Show all distinct payment_status values so we see what's actually in there
        cur.execute("SELECT payment_status, COUNT(*) as cnt FROM orders GROUP BY payment_status")
        print("=== All orders by payment_status ===")
        for row in cur.fetchall():
            print(row)

        print()

        # Show the pending orders in detail
        cur.execute("""
            SELECT id, order_number, customer_name, customer_email, total, status, payment_status, created_at
            FROM orders
            WHERE payment_status = 'pending'
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        print(f"=== Pending orders ({len(rows)}) ===")
        for r in rows:
            print(r)

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
