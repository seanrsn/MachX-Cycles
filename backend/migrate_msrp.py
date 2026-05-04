"""Quick migration script to add msrp column to bikes table."""
import json
import boto3
import pymysql

# Get DB credentials from Secrets Manager
secrets = boto3.client('secretsmanager', region_name='us-east-1')
creds = json.loads(secrets.get_secret_value(SecretId='machx-db-credentials')['SecretString'])

print(f"Connecting to {creds['host']}...")

conn = pymysql.connect(
    host=creds['host'],
    user=creds['username'],
    password=creds['password'],
    database='machx_cycles',
    cursorclass=pymysql.cursors.DictCursor
)

print("Connected.")

try:
    with conn.cursor() as cur:
        # Check if column exists first
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'msrp'")
        if cur.fetchone():
            print("Column 'msrp' already exists.")
        else:
            cur.execute("ALTER TABLE bikes ADD COLUMN msrp DECIMAL(10,2) DEFAULT NULL AFTER base_price")
            conn.commit()
            print("Added 'msrp' column to bikes table.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
    print("Done.")
