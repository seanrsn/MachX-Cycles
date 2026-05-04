"""Drop stock_count column from bikes table if it exists."""
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
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM information_schema.columns
            WHERE table_schema = 'machx_cycles'
              AND table_name = 'bikes'
              AND column_name = 'stock_count'
        """)
        exists = cur.fetchone()['cnt'] > 0

        if not exists:
            print("Column 'stock_count' not found. Nothing to do.")
        else:
            cur.execute("ALTER TABLE bikes DROP COLUMN stock_count")
            conn.commit()
            print("Dropped 'stock_count' column from bikes table.")

        # Show current bikes columns for confirmation
        cur.execute("""
            SELECT column_name, column_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'machx_cycles' AND table_name = 'bikes'
            ORDER BY ordinal_position
        """)
        cols = cur.fetchall()
        print("\nCurrent bikes columns:")
        for c in cols:
            print(f"  {c['column_name']} {c['column_type']} nullable={c['is_nullable']} default={c['column_default']}")

    print("\nDone.")
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
