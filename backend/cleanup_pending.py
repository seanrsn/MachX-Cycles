"""Delete all pending/unpaid orders — abandoned checkouts."""
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
        # Count pending orders
        cur.execute("SELECT COUNT(*) AS cnt FROM orders WHERE payment_status = 'unpaid'")
        count = cur.fetchone()['cnt']
        print(f"Found {count} unpaid/pending orders to delete.")
        
        if count > 0:
            # Delete order items first (FK constraint)
            cur.execute("DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.payment_status = 'unpaid'")
            
            # Delete order events
            cur.execute("DELETE oe FROM order_events oe JOIN orders o ON o.id = oe.order_id WHERE o.payment_status = 'unpaid'")
            
            # Delete the orders
            cur.execute("DELETE FROM orders WHERE payment_status = 'unpaid'")
            conn.commit()
            print(f"Deleted {count} abandoned orders.")
        else:
            print("No pending orders to clean up.")
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
    print("Done.")
