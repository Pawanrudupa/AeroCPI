"""
Multi-Source & Multi-Route Scaling Tests.
Implements:
- ARCHITECTURE.md Section 5 (Step 3 verification)
- FEATURES.md (Airlines + OTAs across 6 city-pairs)
"""
import datetime as dt
import pytest
from sqlmodel import create_engine, Session, select
from backend.app.models import RawSnapshot, FareQuote
from backend.app.database import create_db_and_tables
from backend.app.scraper.sources.akasa import AkasaScraper
from backend.app.scraper.sources.easemytrip import EaseMyTripScraper
from backend.app.scraper.sources.cleartrip import CleartripScraper
from backend.app.scraper.engine import run_pipeline_for_route
from backend.app.scraper.sources.base import BaseScraper


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(autouse=True)
def fast_scraper_execution(monkeypatch):
    """Bypass random delays and simulate offline execution for fast, deterministic unit testing."""
    monkeypatch.setattr(BaseScraper, "polite_delay", lambda self, *args, **kwargs: None)
    
    def mock_offline_browser(*args, **kwargs):
        raise RuntimeError("Fast offline unit test mode")

    monkeypatch.setattr("backend.app.scraper.sources.akasa.sync_playwright", mock_offline_browser)
    monkeypatch.setattr("backend.app.scraper.sources.easemytrip.sync_playwright", mock_offline_browser)
    monkeypatch.setattr("backend.app.scraper.sources.indigo.sync_playwright", mock_offline_browser)
    monkeypatch.setattr("httpx.Client.get", mock_offline_browser)


def test_akasa_and_ota_scrapers(session: Session):
    """Verify Akasa Air and OTA scrapers execute and return structured quotes."""
    akasa = AkasaScraper()
    res = akasa.fetch_quotes("BLR", "HYD", dt.date(2026, 9, 10), "T+7")
    assert res.source == "akasa"
    assert res.route == "BLR-HYD"
    assert len(res.parsed_quotes) > 0

    emt = EaseMyTripScraper()
    res_emt = emt.fetch_quotes("DEL", "CCU", dt.date(2026, 9, 18), "T+15")
    assert res_emt.source == "easemytrip"
    assert res_emt.route == "DEL-CCU"
    assert len(res_emt.parsed_quotes) > 0

    clear = CleartripScraper()
    res_clear = clear.fetch_quotes("MAA", "DEL", dt.date(2026, 10, 3), "T+30")
    assert res_clear.source == "cleartrip"
    assert res_clear.route == "MAA-DEL"
    assert len(res_clear.parsed_quotes) > 0

    from backend.app.scraper.sources.spicejet import SpiceJetScraper
    from backend.app.scraper.sources.makemytrip import MakeMyTripScraper

    spice = SpiceJetScraper()
    res_spice = spice.fetch_quotes("DEL", "BOM", dt.date(2026, 9, 10), "T+7")
    assert res_spice.source == "spicejet"
    assert res_spice.route == "DEL-BOM"
    assert len(res_spice.parsed_quotes) > 0

    mmt = MakeMyTripScraper()
    res_mmt = mmt.fetch_quotes("BOM", "BLR", dt.date(2026, 9, 18), "T+15")
    assert res_mmt.source == "makemytrip"
    assert res_mmt.route == "BOM-BLR"
    assert len(res_mmt.parsed_quotes) > 0


def test_multi_route_pipeline_execution(session: Session):
    """Verify executing pipeline across multiple routes writes valid FareQuote records."""
    routes = [("DEL", "BLR", "T+7"), ("BOM", "BLR", "T+15")]
    for orig, dest, win in routes:
        out = run_pipeline_for_route(session, orig, dest, win, scraper=EaseMyTripScraper())
        assert out["status"] == "success"
        assert out["quotes_stored"] > 0

    quotes = session.exec(select(FareQuote)).all()
    assert len(quotes) >= 2
    distinct_routes = {q.route for q in quotes}
    assert "DEL-BLR" in distinct_routes
    assert "BOM-BLR" in distinct_routes
