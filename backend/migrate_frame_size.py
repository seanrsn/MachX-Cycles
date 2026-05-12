"""Migration: add frame_size column to bikes table.

Stores a size code from the canonical catalog: XS, S, S/M, M, L, L/XL, XL.
Allows intermediary sizes (S/M, L/XL) so we can describe in-between fits.
"""
import json
import boto3
import pymysql

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
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'frame_size'")
        if cur.fetchone():
            print("Column 'frame_size' already exists.")
        else:
            cur.execute(
                "ALTER TABLE bikes ADD COLUMN frame_size VARCHAR(20) DEFAULT NULL AFTER material"
            )
            conn.commit()
            print("Added 'frame_size' column to bikes table.")

        # Add an index so size-filtered queries stay fast
        cur.execute("SHOW INDEX FROM bikes WHERE Key_name = 'idx_bikes_frame_size'")
        if cur.fetchone():
            print("Index 'idx_bikes_frame_size' already exists.")
        else:
            cur.execute("ALTER TABLE bikes ADD INDEX idx_bikes_frame_size (frame_size)")
            conn.commit()
            print("Added index on bikes.frame_size.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
    print("Done.")
