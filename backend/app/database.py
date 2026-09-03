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


def create_db_and_tables(custom_engine=None):
    """Create all SQLModel tables in the database."""
    target_engine = custom_engine or engine
    SQLModel.metadata.create_all(target_engine)


def init_seed_user(session: Session) -> None:
    """
    Initialize seed analyst user if SEED_ANALYST_PASSWORD is provided in the environment.
    Uses non-institutional email 'demo.analyst@aerocpi.local' and Argon2 hashing.
    """
    if not settings.SEED_ANALYST_PASSWORD:
        return
    
    existing = session.exec(
        select(User).where(User.email == settings.SEED_ANALYST_EMAIL)
    ).first()
    
    if not existing:
        seed_user = User(
            email=settings.SEED_ANALYST_EMAIL,
            hashed_password=hash_password(settings.SEED_ANALYST_PASSWORD),
            role="analyst",
            is_active=True
        )
        session.add(seed_user)
        session.commit()
        session.refresh(seed_user)


def get_session() -> Generator[Session, None, None]:
    """FastAPI session dependency."""
    with Session(engine) as session:
        yield session
