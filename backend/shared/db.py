"""
db.py — MachX Cycles MySQL connection helper

Fetches credentials from AWS Secrets Manager and maintains a module-level
connection singleton that auto-reconnects on stale connections.

Usage:
    from shared.db import get_connection

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM bikes WHERE is_active = 1")
        bikes = cur.fetchall()
"""
import json
import logging
import os

import boto3
import pymysql
import pymysql.cursors

from shared.config import DB_SECRET_NAME, DB_HOST, DB_NAME, AWS_REGION

logger = logging.getLogger(__name__)

# ── Module-level connection cache ─────────────────────────────────────────────
_connection: pymysql.Connection | None = None
_db_credentials: dict | None = None


def _get_credentials() -> dict:
    """
    Fetch and cache DB credentials from Secrets Manager.
    Cached for the lifetime of the Lambda container.
    """
    global _db_credentials
    if _db_credentials is not None:
        return _db_credentials

    client = boto3.client('secretsmanager', region_name=AWS_REGION)
    response = client.get_secret_value(SecretId=DB_SECRET_NAME)
    secret   = json.loads(response['SecretString'])

    _db_credentials = secret
    logger.info("DB credentials loaded from Secrets Manager")
    return _db_credentials


def _create_connection() -> pymysql.Connection:
    """Open a new MySQL connection using credentials from Secrets Manager."""
    creds = _get_credentials()

    host     = creds.get('host',     DB_HOST)
    port     = int(creds.get('port', 3306))
    user     = creds.get('username', creds.get('user', ''))
    password = creds.get('password', '')
    dbname   = creds.get('dbname',   DB_NAME)

    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=dbname,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,           # explicit transaction control
        connect_timeout=10,
    )
    logger.info("New MySQL connection established (host=%s, db=%s)", host, dbname)
    return conn


def get_connection() -> pymysql.Connection:
    """
    Return a live MySQL connection.

    Reuses the module-level singleton if it is still alive; creates a new
    one (and replaces the singleton) if the connection has gone stale.
    This handles Lambda container reuse across invocations.
    """
    global _connection

    if _connection is not None:
        try:
            _connection.ping(reconnect=False)
            return _connection
        except Exception:
            logger.warning("DB connection stale — reconnecting")
            try:
                _connection.close()
            except Exception:
                pass
            _connection = None

    _connection = _create_connection()
    return _connection
