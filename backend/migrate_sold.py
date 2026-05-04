"""Add sold BOOLEAN column to bikes table."""
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
        # Check if column already exists
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM information_schema.columns
            WHERE table_schema = 'machx_cycles'
              AND table_name = 'bikes'
              AND column_name = 'sold'
        """)
        exists = cur.fetchone()['cnt'] > 0

        if exists:
            print("Column 'sold' already exists on bikes table. Nothing to do.")
        else:
            cur.execute("ALTER TABLE bikes ADD COLUMN sold BOOLEAN NOT NULL DEFAULT FALSE")
            conn.commit()
            print("Added 'sold BOOLEAN NOT NULL DEFAULT FALSE' column to bikes table.")

    print("Migration complete.")
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
