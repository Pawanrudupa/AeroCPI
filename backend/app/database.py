"""
AeroCPI Database Module.
Implements ARCHITECTURE.md Section 2 (SQLite dev -> PostgreSQL deployment via SQLModel).
"""
from typing import Generator
from sqlmodel import SQLModel, create_engine, Session, select
from backend.app.config import settings
from backend.app.models import User
from backend.app.security import hash_password

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args
)


def migrate_user_columns(custom_engine=None):
    """Ensure newly added columns exist in users table for SQLite without dropping data."""
    target_engine = custom_engine or engine
    from sqlalchemy import text
    with target_engine.connect() as conn:
        # Check existing columns in users table
        try:
            result = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            existing_cols = {row[1] for row in result}
            if existing_cols:
                new_columns = [
                    ("name", "TEXT"),
                    ("organization", "TEXT"),
                    ("must_change_password", "BOOLEAN DEFAULT 0"),
                    ("last_login_at", "TIMESTAMP"),
                    ("api_key_hash", "TEXT"),
                    ("api_key_prefix", "TEXT"),
                    ("api_key_created_at", "TIMESTAMP"),
                ]
                for col_name, col_type in new_columns:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                conn.commit()
        except Exception as e:
            # PRAGMA or table might not exist yet if fresh DB
            pass


def create_db_and_tables(custom_engine=None):
    """Create all SQLModel tables in the database and apply incremental column migrations."""
    target_engine = custom_engine or engine
    SQLModel.metadata.create_all(target_engine)
    migrate_user_columns(target_engine)


def init_seed_user(session: Session) -> None:
    """
    Initialize seed users:
    1. Seed admin user ('admin@aerocpi.local') with ADMIN role.
    2. Seed analyst user ('demo.analyst@aerocpi.local') with ANALYST role.
    """
    # 1. Admin Bootstrap (Provisioned only if BOOTSTRAP_ADMIN_PASSWORD is set in environment)
    admin_password = settings.admin_password
    if admin_password:
        existing_admin = session.exec(
            select(User).where(User.email == settings.SEED_ADMIN_EMAIL)
        ).first()
        if not existing_admin:
            seed_admin = User(
                email=settings.SEED_ADMIN_EMAIL,
                hashed_password=hash_password(admin_password),
                role="admin",
                name="System Administrator",
                organization="AeroCPI Operational Hub",
                is_active=True,
                must_change_password=False
            )
            session.add(seed_admin)
            session.commit()
            session.refresh(seed_admin)
        else:
            # Ensure admin has role 'admin' and basic metadata
            updated = False
            if existing_admin.role != "admin":
                existing_admin.role = "admin"
                updated = True
            if not existing_admin.name:
                existing_admin.name = "System Administrator"
                updated = True
            if not existing_admin.organization:
                existing_admin.organization = "AeroCPI Operational Hub"
                updated = True
            if updated:
                session.add(existing_admin)
                session.commit()

    # 2. Analyst User
    analyst_pass = settings.SEED_ANALYST_PASSWORD or "AnalystSecure2026!"
    existing_analyst = session.exec(
        select(User).where(User.email == settings.SEED_ANALYST_EMAIL)
    ).first()
    
    if not existing_analyst:
        seed_analyst = User(
            email=settings.SEED_ANALYST_EMAIL,
            hashed_password=hash_password(analyst_pass),
            role="analyst",
            name="Demo Analyst",
            organization="MoSPI / Price Statistics Division",
            is_active=True,
            must_change_password=False
        )
        session.add(seed_analyst)
        session.commit()
        session.refresh(seed_analyst)
    else:
        updated = False
        if not existing_analyst.name:
            existing_analyst.name = "Demo Analyst"
            updated = True
        if not existing_analyst.organization:
            existing_analyst.organization = "MoSPI / Price Statistics Division"
            updated = True
        if updated:
            session.add(existing_analyst)
            session.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI session dependency."""
    with Session(engine) as session:
        yield session

