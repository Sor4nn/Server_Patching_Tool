"""Migrate a legacy SQLite database (data/gpta.db) into PostgreSQL 18.

Reads every table from the sqlite file, creates the PG schema, and copies rows
table-by-table in foreign-key order. Run it before starting the app against an
empty PostgreSQL database.

Usage:
    python backend/scripts/migrate_sqlite_to_pg.py [path/to/gpta.db]

Set DATABASE_* env vars (or defaults) to point at the target PostgreSQL.
"""
import sqlite3
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app import config, database  # noqa: E402

TABLES = [
    "users",
    "sessions",
    "host_groups",
    "hosts",
    "patch_runs",
    "host_packages",
    "patch_policies",
    "policy_assignments",
    "policy_exclusions",
    "execution_options",
    "button_bindings",
]

SEQ_COLUMNS = {
    "users": "id",
    "host_groups": "id",
    "hosts": "id",
    "patch_runs": "id",
    "host_packages": "id",
    "patch_policies": "id",
    "policy_assignments": "id",
    "policy_exclusions": "id",
    "execution_options": "id",
    "button_bindings": "id",
}

# Sessions.token is the PK (no serial). host_packages UNIQUE constraint may be
# omitted during copy to let host_id/index stand; keep all cols as-is.
SKIP_COLUMNS = {"sessions": {"id"}}


def main(sqlite_path: str):
    conn_src = sqlite3.connect(sqlite_path)
    conn_src.row_factory = sqlite3.Row
    conn_tgt = psycopg.connect(
        dbname=config.DATABASE_NAME,
        user=config.DATABASE_USER,
        password=config.DATABASE_PASSWORD,
        host=config.DATABASE_HOST,
        port=config.DATABASE_PORT,
        row_factory=dict_row,
    )

    # Build schema on the target (no seeding; copied data includes admin).
    for statement in database.SCHEMA.split(";"):
        if statement.strip():
            conn_tgt.execute(statement)
    conn_tgt.commit()

    for table in TABLES:
        cols = [r["name"] for r in conn_src.execute(f"PRAGMA table_info({table})").fetchall()]
        cols = [c for c in cols if c not in SKIP_COLUMNS.get(table, set())]
        rows = conn_src.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
        if not rows:
            print(f"- {table}: 0 rows (skip)")
            continue
        placeholders = ", ".join(["%s"] * len(cols))
        insert_sql = (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
                      f"ON CONFLICT DO NOTHING")
        conn_tgt.executemany(insert_sql, [tuple(r[c] for c in cols) for r in rows])
        conn_tgt.commit()
        seq_col = SEQ_COLUMNS.get(table)
        if seq_col:
            conn_tgt.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', '{seq_col}'), "
                f"COALESCE((SELECT MAX({seq_col}) FROM {table}), 1))"
            )
            conn_tgt.commit()
        print(f"- {table}: {len(rows)} rows")

    conn_src.close()
    conn_tgt.close()
    print("Migration complete.")


if __name__ == "__main__":
    default = str(config.DB_PATH)
    main(sys.argv[1] if len(sys.argv) > 1 else default)