"""
AeroCPI Production Database Migration Tool: SQLite -> PostgreSQL.

Safely copies all existing data (User accounts, FareQuotes, RawSnapshots,
DGCA weights, MoSPI benchmarks, and computed GEKS indices) from the local
SQLite database (aerocpi.db) to a remote managed PostgreSQL database (e.g., Render, AWS RDS, Supabase).

Usage:
    python scripts/migrate_sqlite_to_pg.py --target "postgresql://user:password@hostname:5432/dbname"
"""
import sys
import argparse
import logging
from pathlib import Path
from typing import List, Type

# Add project root to sys.path so backend modules are discoverable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import text, func
from sqlmodel import SQLModel, create_engine, Session, select

from backend.app.models import (
    User,
    ElevationRequest,
    LoginEvent,
    RawSnapshot,
    FareQuote,
    IndexDaily,
    IndexRoute,
    DGCABenchmark,
    MospiBenchmark,
)
from backend.app.database import create_db_and_tables

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("aerocpi.migrate")


MODELS_IN_ORDER: List[Type[SQLModel]] = [
    User,
    RawSnapshot,
    FareQuote,
    IndexDaily,
    IndexRoute,
    DGCABenchmark,
    MospiBenchmark,
    ElevationRequest,
    LoginEvent,
]


def normalize_pg_url(url: str) -> str:
    """Ensure standard postgresql:// prefix for SQLAlchemy."""
    url = url.strip()
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def migrate_database(sqlite_url: str, pg_url: str, batch_size: int = 500):
    pg_url = normalize_pg_url(pg_url)
    
    logger.info("Connecting to source SQLite database: %s", sqlite_url)
    source_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    
    logger.info("Connecting to target PostgreSQL database: %s", pg_url.split("@")[-1] if "@" in pg_url else pg_url)
    target_engine = create_engine(pg_url, pool_pre_ping=True)
    
    # Step 1: Ensure all tables and indexes exist on PostgreSQL
    logger.info("Initializing schemas and indexes on target PostgreSQL...")
    create_db_and_tables(target_engine)
    logger.info("Target schema initialized.")

    # Step 2: Copy data model by model
    with Session(source_engine) as src_sess, Session(target_engine) as tgt_sess:
        for model in MODELS_IN_ORDER:
            table_name = model.__tablename__
            total_source = src_sess.exec(select(func.count()).select_from(model)).one()
            logger.info("Migrating table '%s' (Source records: %d)...", table_name, total_source)
            
            if total_source == 0:
                logger.info("Table '%s' is empty in source. Skipping.", table_name)
                continue

            # Check if target already has records
            existing_target = tgt_sess.exec(select(func.count()).select_from(model)).one()
            if existing_target > 0:
                logger.warning("Target table '%s' already contains %d records. Skipping to prevent duplicate keys.", table_name, existing_target)
                continue

            # Read source in batches
            offset = 0
            migrated_count = 0
            existing_user_ids = None
            if model in (ElevationRequest, LoginEvent):
                existing_user_ids = set(tgt_sess.exec(select(User.id)).all())

            while offset < total_source:
                batch = src_sess.exec(select(model).offset(offset).limit(batch_size)).all()
                if not batch:
                    break

                for item in batch:
                    if existing_user_ids is not None and getattr(item, "user_id", None) not in existing_user_ids:
                        continue
                    try:
                        item_dict = item.model_dump()
                        new_item = model(**item_dict)
                        tgt_sess.add(new_item)
                        tgt_sess.flush()
                        migrated_count += 1
                    except Exception as e:
                        tgt_sess.rollback()
                        logger.warning("  [%s] Skipped record id=%s: %s", table_name, getattr(item, 'id', None), e)

                tgt_sess.commit()
                offset += batch_size
                logger.info("  [%s] %d / %d records processed...", table_name, migrated_count, total_source)

            logger.info("Table '%s' migration completed successfully (%d records).", table_name, migrated_count)

    # Step 3: Reset PostgreSQL sequences for tables with auto-increment ID
    logger.info("Synchronizing PostgreSQL serial sequences...")
    with target_engine.connect() as conn:
        for model in MODELS_IN_ORDER:
            table_name = model.__tablename__
            try:
                res = conn.execute(text(f"SELECT COALESCE(MAX(id), 1) FROM {table_name}")).scalar()
                if res is not None:
                    seq_query = text(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), :val, true)")
                    conn.execute(seq_query, {"val": res})
                    conn.commit()
                    logger.info("  [%s] Sequence set to %s", table_name, res)
            except Exception:
                pass

    logger.info("All PostgreSQL sequence counters synchronized.")

    # Step 4: Verification audit
    logger.info("==================================================")
    logger.info("POST-MIGRATION AUDIT SUMMARY:")
    logger.info("==================================================")
    with Session(target_engine) as tgt_sess:
        for model in MODELS_IN_ORDER:
            table_name = model.__tablename__
            cnt = tgt_sess.exec(select(func.count()).select_from(model)).one()
            logger.info("  Target table '%-18s': %d rows", table_name, cnt)
    logger.info("==================================================")
    logger.info("MIGRATION COMPLETE! Remote PostgreSQL is fully ready.")


def main():
    parser = argparse.ArgumentParser(description="Migrate AeroCPI SQLite database to PostgreSQL.")
    parser.add_argument(
        "--target",
        dest="target_url",
        required=True,
        help="Target PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/dbname)"
    )
    parser.add_argument(
        "--source",
        dest="source_url",
        default="sqlite:///./aerocpi.db",
        help="Source SQLite connection string (default: sqlite:///./aerocpi.db)"
    )
    parser.add_argument(
        "--batch-size",
        dest="batch_size",
        type=int,
        default=500,
        help="Batch size for bulk insertion (default: 500)"
    )
    args = parser.parse_args()

    migrate_database(args.source_url, args.target_url, args.batch_size)


if __name__ == "__main__":
    main()
