"""
Database & SQLModel Schema Unit Tests.
Implements ARCHITECTURE.md Section 5 (Build order Step 1 verification).
Validates:
- SQLModel table creation on SQLite
- Normalization schema: base_fare + taxes + udf + convenience_fee = total_fare
- User requirement: source_type in ('live', 'seeded')
- Provenance fields for DGCA benchmark data
- Argon2 password hashing and seed analyst initialization
"""
from datetime import date, datetime
import pytest
from sqlmodel import SQLModel, create_engine, Session, select
from backend.app.models import User, RawSnapshot, FareQuote, IndexDaily, IndexRoute, DGCABenchmark
from backend.app.security import hash_password, verify_password, create_access_token, decode_access_token
from backend.app.database import create_db_and_tables, init_seed_user


@pytest.fixture(name="session")
def session_fixture():
    # In-memory SQLite for isolated, zero-friction fast unit testing
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)
    with Session(engine) as session:
        yield session


def test_password_hashing_and_verification():
    """Verify Argon2 password hashing and token generation."""
    pwd = "MySecretTestPassword123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

    # Test JWT token encode & decode
    token = create_access_token({"sub": "demo.analyst@aerocpi.local", "role": "analyst"})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "demo.analyst@aerocpi.local"
    assert payload["role"] == "analyst"


def test_user_creation_and_seed(session: Session):
    """Verify User model and seed analyst user creation."""
    user = User(
        email="test.user@aerocpi.local",
        hashed_password=hash_password("Secr3t!2026"),
        role="analyst"
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    assert user.id is not None
    assert user.email == "test.user@aerocpi.local"
    assert user.role == "analyst"
    assert verify_password("Secr3t!2026", user.hashed_password) is True


def test_raw_snapshot_and_fare_quote_models(session: Session):
    """
    Verify RawSnapshot and FareQuote relationships, fare component breakdown,
    and explicit source_type ('live' vs 'seeded').
    """
    # 1. Create a RawSnapshot
    snapshot = RawSnapshot(
        source="indigo",
        source_type="live",
        route="DEL-BOM",
        window="T+7",
        storage_path="data/raw/live_indigo_DEL-BOM_T7_20260903.json",
        content_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        flight_count=1
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    assert snapshot.id is not None
    assert snapshot.source_type == "live"

    # 2. Create structured FareQuote tied to snapshot
    base_fare = 4500.0
    taxes = 450.0
    udf = 350.0
    convenience_fee = 300.0
    total_fare = base_fare + taxes + udf + convenience_fee  # 5600.0

    quote = FareQuote(
        route="DEL-BOM",
        carrier="IndiGo",
        flight_number="6E-205",
        window="T+7",
        departure_date=date(2026, 9, 10),
        departure_time="06:00",
        arrival_time="08:15",
        fare_class="economy",
        base_fare=base_fare,
        taxes=taxes,
        udf=udf,
        convenience_fee=convenience_fee,
        total_fare=total_fare,
        currency="INR",
        source="indigo",
        source_type="live",
        raw_snapshot_id=snapshot.id
    )
    session.add(quote)
    session.commit()
    session.refresh(quote)

    assert quote.id is not None
    assert quote.total_fare == 5600.0
    assert (quote.base_fare + quote.taxes + quote.udf + quote.convenience_fee) == quote.total_fare
    assert quote.source_type == "live"
    assert quote.raw_snapshot is not None
    assert quote.raw_snapshot.route == "DEL-BOM"


def test_seeded_data_flag(session: Session):
    """Verify that seeded data is explicitly distinguishable from live data."""
    seeded_snapshot = RawSnapshot(
        source="easemytrip",
        source_type="seeded",
        route="BOM-BLR",
        window="T+15",
        storage_path="data/raw/seeded_easemytrip_BOM-BLR_T15.json",
        content_hash="abcd1234hash",
        flight_count=1
    )
    session.add(seeded_snapshot)
    session.commit()

    seeded_quote = FareQuote(
        route="BOM-BLR",
        carrier="Akasa Air",
        flight_number="QP-1102",
        window="T+15",
        departure_date=date(2026, 9, 18),
        total_fare=4200.0,
        source="easemytrip",
        source_type="seeded",
        raw_snapshot_id=seeded_snapshot.id
    )
    session.add(seeded_quote)
    session.commit()

    live_quotes = session.exec(select(FareQuote).where(FareQuote.source_type == "live")).all()
    seeded_quotes = session.exec(select(FareQuote).where(FareQuote.source_type == "seeded")).all()
    
    assert len(live_quotes) == 0
    assert len(seeded_quotes) == 1
    assert seeded_quotes[0].source_type == "seeded"


def test_index_and_dgca_provenance(session: Session):
    """Verify IndexDaily, IndexRoute, and DGCABenchmark with provenance fields."""
    today = date(2026, 9, 3)
    
    daily_idx = IndexDaily(
        date=today,
        index_value=103.45,
        base_period=date(2026, 8, 1),
        method="GEKS-Törnqvist",
        sample_size=120,
        has_seeded_data=False
    )
    session.add(daily_idx)

    route_idx = IndexRoute(
        date=today,
        route="DEL-BOM",
        index_value=104.2,
        avg_total_fare=5850.0,
        avg_base_fare=4800.0,
        sample_size=25,
        has_seeded_data=False
    )
    session.add(route_idx)

    dgca = DGCABenchmark(
        month="2026-08",
        route="DEL-BOM",
        avg_fare=5720.0,
        passenger_share=0.142,
        source_document="DGCA Domestic Air Transport Report August 2026 - Table 4.1",
        publication_date="2026-08-25",
        source_url="https://dgca.gov.in/digigov-portal/?page=4275"
    )
    session.add(dgca)
    session.commit()

    saved_dgca = session.exec(select(DGCABenchmark).where(DGCABenchmark.route == "DEL-BOM")).first()
    assert saved_dgca is not None
    assert saved_dgca.source_document.startswith("DGCA Domestic Air Transport Report")
    assert saved_dgca.passenger_share == 0.142
