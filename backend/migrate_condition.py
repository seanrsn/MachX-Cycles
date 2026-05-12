"""Migration: add condition column to bikes table.

Stores a condition code from the catalog: excellent, very_good, good, fair.
Lets us communicate honest cosmetic state on pre-owned bikes.
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
        cur.execute("SHOW COLUMNS FROM bikes LIKE 'condition_grade'")
        if cur.fetchone():
            print("Column 'condition_grade' already exists.")
        else:
            # Note: 'condition' is a reserved word in some MySQL contexts (e.g.,
            # IF/CASE), so we use 'condition_grade' to keep queries simple.
            cur.execute(
                "ALTER TABLE bikes ADD COLUMN condition_grade VARCHAR(20) DEFAULT NULL AFTER frame_size"
            )
            conn.commit()
            print("Added 'condition_grade' column to bikes table.")

        cur.execute("SHOW INDEX FROM bikes WHERE Key_name = 'idx_bikes_condition'")
        if cur.fetchone():
            print("Index 'idx_bikes_condition' already exists.")
        else:
            cur.execute("ALTER TABLE bikes ADD INDEX idx_bikes_condition (condition_grade)")
            conn.commit()
            print("Added index on bikes.condition_grade.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
    print("Done.")
