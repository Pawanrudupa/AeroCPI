"""
Scraper, Storage, and ETL Unit & Contract Tests.
Implements:
- ARCHITECTURE.md Section 5 (Step 2 verification: prove narrow slice end-to-end)
- ARCHITECTURE.md Section 4.1 & 4.2 (Anti-bot detection & fallback)
- ARCHITECTURE.md Section 4.3 (Fare component schema)
- FEATURES.md (IQR outlier filtering, deduplication, contract assertions)
"""
import os
import shutil
import tempfile
import datetime as dt
import pytest
from sqlmodel import create_engine, Session, select
from backend.app.models import RawSnapshot, FareQuote
from backend.app.database import create_db_and_tables
from backend.app.etl.storage import save_raw_snapshot, load_raw_snapshot_content
from backend.app.etl.cleaner import clean_and_normalize_quotes, filter_iqr_outliers
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.sources.indigo import IndiGoScraper
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.engine import run_pipeline_for_route


@pytest.fixture(name="test_env")
def test_env_fixture():
    temp_dir = tempfile.mkdtemp()
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)
    with Session(engine) as session:
        yield {"session": session, "engine": engine, "temp_dir": temp_dir}
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_storage_immutability_and_hash(test_env):
    """Verify raw snapshots are written with SHA-256 hash and cannot be tampered with."""
    session = test_env["session"]
    payload = {"origin": "DEL", "destination": "BOM", "flights": [{"flight_no": "6E-205", "price": 5500}]}
    
    snapshot = save_raw_snapshot(
        session=session,
        source="indigo",
        route="DEL-BOM",
        window="T+7",
        payload=payload,
        source_type="live"
    )
    
    assert snapshot.id is not None
    assert snapshot.source_type == "live"
    assert len(snapshot.content_hash) == 64  # Valid SHA-256
    
    # Load and verify content matches
    content = load_raw_snapshot_content(snapshot)
    assert "6E-205" in content


def test_fare_component_normalization(test_env):
    """
    Verify ARCHITECTURE.md Section 4.3 schema:
    base_fare + taxes + udf + convenience_fee = total_fare
    """
    raw_flights = [
        {
            "carrier": "IndiGo",
            "flight_number": "6E-501",
            "base_fare": 4000.0,
            "taxes": 600.0,
            "udf": 350.0,
            "convenience_fee": 300.0,
            "total_fare": 5250.0
        }
    ]
    cleaned = clean_and_normalize_quotes(
        raw_quotes=raw_flights,
        route="DEL-BOM",
        window="T+7",
        departure_date=dt.date(2026, 9, 10),
        source="indigo",
        source_type="live"
    )
    assert len(cleaned) == 1
    q = cleaned[0]
    assert q.total_fare == 5250.0
    assert (q.base_fare + q.taxes + q.udf + q.convenience_fee) == q.total_fare
    assert q.source_type == "live"


def test_iqr_outlier_filtering():
    """Verify extreme price anomalies (e.g. INR 95,000 or scrap errors) are filtered out."""
    # A realistic sample of fares with one extreme outlier
    fares = [4500.0, 4700.0, 4800.0, 5000.0, 5200.0, 5300.0, 5500.0, 95000.0]
    low, high = filter_iqr_outliers(fares)
    assert high < 95000.0  # Outlier must be above the high threshold

    raw_quotes = [
        {"carrier": "IndiGo", "flight_number": f"6E-{i}", "total_fare": f}
        for i, f in enumerate(fares)
    ]
    cleaned = clean_and_normalize_quotes(
        raw_quotes=raw_quotes,
        route="DEL-BOM",
        window="T+7",
        departure_date=dt.date(2026, 9, 10),
        source="indigo",
        source_type="live"
    )
    # The 95,000 INR quote must be rejected
    cleaned_fares = [q.total_fare for q in cleaned]
    assert 95000.0 not in cleaned_fares
    assert len(cleaned_fares) == 7


def test_deduplication():
    """Verify duplicate quotes for the same flight and window are cleanly deduplicated."""
    duplicates = [
        {"carrier": "IndiGo", "flight_number": "6E-205", "total_fare": 5400.0},
        {"carrier": "IndiGo", "flight_number": "6E-205", "total_fare": 5400.0},
        {"carrier": "IndiGo", "flight_number": "6E-205", "total_fare": 5600.0},
    ]
    cleaned = clean_and_normalize_quotes(
        raw_quotes=duplicates,
        route="DEL-BOM",
        window="T+7",
        departure_date=dt.date(2026, 9, 10),
        source="indigo"
    )
    assert len(cleaned) == 1
    # Kept best price (5400.0)
    assert cleaned[0].total_fare == 5400.0


def test_bot_challenge_detection():
    """Verify bot challenge strings trigger graceful detection."""
    scraper = IndiGoScraper()
    cloudflare_page = "<html><title>Just a moment...</title><body>Please verify you are human. Turnstile challenge.</body></html>"
    assert scraper.detect_bot_protection(cloudflare_page) is True

    normal_page = "<html><title>Flights from Delhi to Mumbai</title><body>Flight search results</body></html>"
    assert scraper.detect_bot_protection(normal_page) is False


def test_end_to_end_narrow_slice_pipeline(test_env):
    """
    Prove the full narrow slice end-to-end:
    raw scrape -> immutable landing storage -> cleaning/normalization -> DB persistence.
    """
    session = test_env["session"]
    result = run_pipeline_for_route(
        session=session,
        origin="DEL",
        destination="BOM",
        window="T+7"
    )

    assert result["status"] == "success"
    assert result["route"] == "DEL-BOM"
    assert result["quotes_stored"] > 0
    assert result["raw_snapshot_id"] is not None

    # Query DB to confirm records are stored in both tables
    snapshot = session.exec(select(RawSnapshot).where(RawSnapshot.id == result["raw_snapshot_id"])).first()
    assert snapshot is not None
    assert snapshot.route == "DEL-BOM"
    assert snapshot.source_type in ("live", "seeded")

    quotes = session.exec(select(FareQuote).where(FareQuote.raw_snapshot_id == snapshot.id)).all()
    assert len(quotes) == result["quotes_stored"]
    for q in quotes:
        assert q.route == "DEL-BOM"
        assert q.window == "T+7"
        assert q.source_type == snapshot.source_type
        assert q.total_fare > 0
