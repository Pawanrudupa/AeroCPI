"""
GEKS-Törnqvist Price Index Mathematical Property & Persistence Unit Tests.
Implements:
- ARCHITECTURE.md Section 2 (GEKS-Törnqvist unit tests)
- ARCHITECTURE.md Section 4.4 (Weighting and transitivity verification)
- FEATURES.md (Daily index and aggregation)
"""
import math
import datetime as dt
import pytest
from sqlmodel import create_engine, Session, select
from backend.app.models import FareQuote, IndexDaily, IndexRoute
from backend.app.database import create_db_and_tables
from backend.app.index.geks import (
    compute_tornqvist_log_ratio,
    compute_geks_tornqvist_index,
    aggregate_to_weekly,
    aggregate_to_monthly,
    calculate_and_save_daily_indices,
    DGCA_ROUTE_WEIGHTS
)


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)
    with Session(engine) as session:
        yield session


def test_geks_identity_and_proportionality():
    """Verify identity axiom: base period index is 100.0, and 10% price rise yields 110.0."""
    d0 = dt.date(2026, 9, 1)
    d1 = dt.date(2026, 9, 2)
    d2 = dt.date(2026, 9, 3)

    prices = {
        d0: {"DEL-BOM": 5000.0, "DEL-BLR": 6000.0},
        d1: {"DEL-BOM": 5500.0, "DEL-BLR": 6600.0},  # Exactly +10% across all routes
        d2: {"DEL-BOM": 5250.0, "DEL-BLR": 6300.0}   # Exactly +5% across all routes
    }

    indices = compute_geks_tornqvist_index(prices, base_date=d0)
    
    # 1. Identity
    assert indices[d0] == 100.0
    
    # 2. Proportionality (+10% on d1, +5% on d2)
    assert abs(indices[d1] - 110.0) < 0.1
    assert abs(indices[d2] - 105.0) < 0.1


def test_geks_transitivity():
    """
    Verify multilateral transitivity axiom:
    P(0, 1) * P(1, 2) = P(0, 2)
    """
    d0 = dt.date(2026, 9, 1)
    d1 = dt.date(2026, 9, 2)
    d2 = dt.date(2026, 9, 3)

    prices = {
        d0: {"DEL-BOM": 4800.0, "DEL-BLR": 5800.0, "BOM-BLR": 4200.0},
        d1: {"DEL-BOM": 5100.0, "DEL-BLR": 6200.0, "BOM-BLR": 4000.0},
        d2: {"DEL-BOM": 4950.0, "DEL-BLR": 5900.0, "BOM-BLR": 4350.0}
    }

    # Index with base d0
    idx_from_0 = compute_geks_tornqvist_index(prices, base_date=d0)
    # Index with base d1
    idx_from_1 = compute_geks_tornqvist_index(prices, base_date=d1)

    p01 = idx_from_0[d1] / 100.0
    p12 = idx_from_1[d2] / 100.0
    p02 = idx_from_0[d2] / 100.0

    # GEKS guarantees transitivity: p01 * p12 == p02
    assert abs((p01 * p12) - p02) < 0.001


def test_aggregation_functions():
    """Verify daily index series aggregates smoothly into weekly and monthly series."""
    daily = {
        dt.date(2026, 9, 1): 100.0,
        dt.date(2026, 9, 2): 102.0,
        dt.date(2026, 9, 3): 104.0,
    }
    weekly = aggregate_to_weekly(daily)
    monthly = aggregate_to_monthly(daily)

    assert len(weekly) == 1
    assert len(monthly) == 1
    # Average of 100, 102, 104 geometric mean is ~101.99
    for m, val in monthly.items():
        assert abs(val - 102.0) < 0.1


def test_calculate_and_save_daily_indices(session: Session):
    """Verify persisting GEKS indices into SQLModel database."""
    d0 = dt.date(2026, 9, 1)
    d1 = dt.date(2026, 9, 2)

    quotes = [
        FareQuote(route="DEL-BOM", carrier="IndiGo", window="T+7", departure_date=d0, total_fare=5000.0, source="indigo", source_type="live"),
        FareQuote(route="DEL-BLR", carrier="IndiGo", window="T+7", departure_date=d0, total_fare=6000.0, source="indigo", source_type="live"),
        FareQuote(route="DEL-BOM", carrier="IndiGo", window="T+7", departure_date=d1, total_fare=5250.0, source="indigo", source_type="live"),
        FareQuote(route="DEL-BLR", carrier="IndiGo", window="T+7", departure_date=d1, total_fare=6300.0, source="indigo", source_type="seeded"),
    ]
    for q in quotes:
        session.add(q)
    session.commit()

    saved = calculate_and_save_daily_indices(session, base_date=d0)
    assert len(saved) == 2

    # Check DB tables
    db_daily = session.exec(select(IndexDaily).order_by(IndexDaily.date)).all()
    assert len(db_daily) == 2
    assert db_daily[0].index_value == 100.0
    assert db_daily[1].index_value == 105.0  # +5%
    assert db_daily[0].has_seeded_data is False
    assert db_daily[1].has_seeded_data is True  # d1 included one seeded quote

    db_routes = session.exec(select(IndexRoute)).all()
    assert len(db_routes) > 0
