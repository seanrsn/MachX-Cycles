"""Update shipping rates - remove Express, keep only Standard (free) and Local Pickup (free)."""
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
        # Delete all existing rates
        cur.execute("DELETE FROM shipping_rates")
        
        # Insert the two free options
        cur.execute("""
            INSERT INTO shipping_rates (name, price, estimated_days, is_active) VALUES
            ('Standard Shipping (FREE)', 0.00, '5-7 business days', 1),
            ('Local Pickup - Brooklyn, NY (FREE)', 0.00, 'Ready same day', 1)
        """)
        conn.commit()
        
        # Verify
        cur.execute("SELECT * FROM shipping_rates")
        rates = cur.fetchall()
        print("Updated rates:", rates)
        
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
    print("Done.")
