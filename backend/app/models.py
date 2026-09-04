"""
AeroCPI Database Models via SQLModel.
Implements:
- ARCHITECTURE.md Section 2 (SQLModel ORM)
- ARCHITECTURE.md Section 3 (fares, dgca_monthly, index summaries)
- ARCHITECTURE.md Section 4.3 (Fare component schema: base_fare + taxes + udf + convenience_fee = total_fare)
- User Requirement: source_type ("live" | "seeded") on raw snapshots and fare quotes
- User Requirement: Non-institutional user auth model with Argon2 hash
"""
import datetime as dt
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class User(SQLModel, table=True):
    """
    User model for JWT-authenticated API access (ARCHITECTURE.md Section 2).
    Used for demo analyst access and API clients.
    """
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    role: str = Field(default="analyst")  # analyst, admin
    is_active: bool = Field(default=True)
    created_at: dt.datetime = Field(default_factory=now_utc)


class RawSnapshot(SQLModel, table=True):
    """
    Immutable raw scrape landing record (ARCHITECTURE.md Section 1 & 3).
    Stores metadata pointing to the raw JSON/HTML snapshot stored in the landing zone.
    Explicit user requirement: source_type must distinguish 'live' vs 'seeded'.
    """
    __tablename__ = "raw_snapshots"

    id: Optional[int] = Field(default=None, primary_key=True)
    source: str = Field(index=True, nullable=False)  # e.g. 'indigo', 'akasa', 'easemytrip', 'cleartrip'
    source_type: str = Field(default="live", index=True, nullable=False)  # 'live' | 'seeded'
    route: str = Field(index=True, nullable=False)  # e.g. 'DEL-BOM'
    window: str = Field(index=True, nullable=False)  # 'T+7', 'T+15', 'T+30'
    scrape_timestamp: dt.datetime = Field(default_factory=now_utc, index=True)
    storage_path: str = Field(nullable=False)  # path in RAW_STORAGE_DIR
    content_hash: str = Field(nullable=False)  # SHA-256 for audit immutability
    flight_count: int = Field(default=0)
    status: str = Field(default="success")  # 'success', 'selector_fallback', 'captcha_detected'
    
    # Relationship to structured quotes
    quotes: List["FareQuote"] = Relationship(back_populates="raw_snapshot")


class FareQuote(SQLModel, table=True):
    """
    Structured, cleaned fare quotes (ARCHITECTURE.md Section 3 & 4.3).
    Normalization schema:
    base_fare + taxes + udf + convenience_fee = total_fare
    Explicit user requirement: source_type must distinguish 'live' vs 'seeded'.
    """
    __tablename__ = "fares"

    id: Optional[int] = Field(default=None, primary_key=True)
    route: str = Field(index=True, nullable=False)  # e.g. 'DEL-BOM'
    carrier: str = Field(index=True, nullable=False)  # e.g. 'IndiGo', 'Akasa Air'
    flight_number: Optional[str] = Field(default=None, index=True)
    window: str = Field(index=True, nullable=False)  # 'T+7', 'T+15', 'T+30'
    departure_date: dt.date = Field(index=True, nullable=False)
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    fare_class: str = Field(default="economy", index=True)  # MVP focuses on economy
    
    # Normalized Fare Component Breakdown (ARCHITECTURE.md Section 4.3)
    base_fare: Optional[float] = None
    taxes: Optional[float] = None
    udf: Optional[float] = None  # User Development Fee
    convenience_fee: Optional[float] = None
    total_fare: float = Field(index=True, nullable=False)
    currency: str = Field(default="INR")

    # Traceability & Source Origin (User requirement: live vs seeded)
    source: str = Field(index=True, nullable=False)  # 'indigo', 'akasa', 'spicejet', 'easemytrip', 'cleartrip', 'makemytrip'
    source_type: str = Field(default="live", index=True, nullable=False)  # 'live' | 'seeded'
    scraped_at: dt.datetime = Field(default_factory=now_utc, index=True)
    
    raw_snapshot_id: Optional[int] = Field(default=None, foreign_key="raw_snapshots.id")
    raw_snapshot: Optional[RawSnapshot] = Relationship(back_populates="quotes")


class IndexDaily(SQLModel, table=True):
    """
    AeroCPI Daily Index Summary (ARCHITECTURE.md Section 3 & 4.4).
    Computed via multilateral GEKS-Törnqvist method with DGCA traffic weights.
    """
    __tablename__ = "index_daily"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: dt.date = Field(unique=True, index=True, nullable=False)
    index_value: float = Field(nullable=False)  # Base 100.0
    base_period: dt.date = Field(nullable=False)
    method: str = Field(default="GEKS-Törnqvist", nullable=False)
    sample_size: int = Field(default=0)
    has_seeded_data: bool = Field(default=False, index=True)  # Flag if any quote in period is seeded
    computed_at: dt.datetime = Field(default_factory=now_utc)


class IndexRoute(SQLModel, table=True):
    """
    Route-specific daily price index and average fare metrics.
    """
    __tablename__ = "index_route"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: dt.date = Field(index=True, nullable=False)
    route: str = Field(index=True, nullable=False)  # 'DEL-BOM', etc.
    index_value: float = Field(nullable=False)
    avg_total_fare: float = Field(nullable=False)
    avg_base_fare: Optional[float] = None
    sample_size: int = Field(default=0)
    has_seeded_data: bool = Field(default=False)


class DGCABenchmark(SQLModel, table=True):
    """
    Official DGCA Monthly Air Transport Benchmark (ARCHITECTURE.md Section 4.4 & 4.6).
    Stores real published passenger yield / tariffs and passenger traffic share (PSD weights).
    User requirement: Strict provenance tracking (report title, publication date, URL).
    """
    __tablename__ = "dgca_monthly"

    id: Optional[int] = Field(default=None, primary_key=True)
    month: str = Field(index=True, nullable=False)  # e.g. '2026-07' or '2026-08'
    route: str = Field(index=True, nullable=False)  # 'DEL-BOM', etc.
    avg_fare: float = Field(nullable=False)  # Average passenger yield / tariff in INR
    passenger_share: float = Field(nullable=False)  # DGCA traffic share for weighting (PSD)
    
    # Provenance fields (User requirement: no fabricated data, explicit citations)
    source_document: str = Field(nullable=False)  # e.g. 'DGCA Monthly Air Transport Report - Table 4.1'
    publication_date: str = Field(nullable=False)  # e.g. '2026-08-25'
    source_url: Optional[str] = None  # e.g. 'https://dgca.gov.in'
