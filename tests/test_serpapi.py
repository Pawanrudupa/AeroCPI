"""
Unit and Integration Tests for SerpAPI Google Flights Integration.
"""
import datetime as dt
from unittest.mock import patch
import pytest
from sqlmodel import create_engine, Session, select

from backend.app.database import create_db_and_tables
from backend.app.models import FareQuote, RawSnapshot
from backend.app.scraper.sources.serpapi import (
    SerpApiGoogleFlightsScraper,
    parse_serpapi_flight_items
)
from backend.app.scraper.engine import run_pipeline_for_route


MOCK_SERPAPI_PAYLOAD = {
    "best_flights": [
        {
            "flights": [
                {
                    "airline": "IndiGo",
                    "flight_number": "6E 205",
                    "travel_class": "Economy",
                    "departure_airport": {"id": "DEL", "time": "2026-09-13 08:00"},
                    "arrival_airport": {"id": "BOM", "time": "2026-09-13 10:15"}
                }
            ],
            "price": 5400
        }
    ],
    "other_flights": [
        {
            "flights": [
                {
                    "airline": "Akasa Air",
                    "flight_number": "QP 1102",
                    "travel_class": "Economy",
                    "departure_airport": {"id": "DEL", "time": "2026-09-13 14:00"},
                    "arrival_airport": {"id": "BOM", "time": "2026-09-13 16:10"}
                }
            ],
            "price": 4900
        },
        {
            "flights": [
                {
                    "airline": "SpiceJet",
                    "flight_number": "SG 8169",
                    "travel_class": "Economy",
                    "departure_airport": {"id": "DEL", "time": "2026-09-13 19:30"},
                    "arrival_airport": {"id": "BOM", "time": "2026-09-13 21:45"}
                }
            ],
            "price": 5100
        }
    ]
}


def test_parse_serpapi_flight_items():
    """Verify parsing of raw SerpAPI JSON into AeroCPI quote schemas."""
    departure_date = dt.date(2026, 9, 13)
    quotes = parse_serpapi_flight_items(
        payload=MOCK_SERPAPI_PAYLOAD,
        route="DEL-BOM",
        window="T+7",
        departure_date=departure_date
    )

    assert len(quotes) == 3
    carriers = [q["carrier"] for q in quotes]
    assert "IndiGo" in carriers
    assert "Akasa Air" in carriers
    assert "SpiceJet" in carriers

    indigo_quote = next(q for q in quotes if q["carrier"] == "IndiGo")
    assert indigo_quote["total_fare"] == 5400.0
    assert indigo_quote["base_fare"] is None  # Direct honesty: no synthetic split
    assert indigo_quote["taxes"] is None      # Direct honesty: no synthetic split
    assert indigo_quote["source"] == "indigo" # Correctly mapped to carrier source
    assert indigo_quote["flight_number"] == "6E 205"
    assert indigo_quote["departure_time"] == "08:00"
    assert indigo_quote["arrival_time"] == "10:15"


def test_parse_serpapi_target_carrier_filter():
    """Verify carrier-specific filtering when target_carrier is specified."""
    departure_date = dt.date(2026, 9, 13)
    quotes = parse_serpapi_flight_items(
        payload=MOCK_SERPAPI_PAYLOAD,
        route="DEL-BOM",
        window="T+7",
        departure_date=departure_date,
        target_carrier="Akasa Air"
    )

    assert len(quotes) == 1
    assert quotes[0]["carrier"] == "Akasa Air"
    assert quotes[0]["source"] == "akasa"
    assert quotes[0]["flight_number"] == "QP 1102"
    assert quotes[0]["total_fare"] == 4900.0
    assert quotes[0]["base_fare"] is None
    assert quotes[0]["taxes"] is None


def test_serpapi_scraper_mocked_fetch():
    """Verify SerpApiGoogleFlightsScraper produces live-tagged ScrapeResult."""
    scraper = SerpApiGoogleFlightsScraper()
    departure_date = dt.date(2026, 9, 13)

    with patch("backend.app.scraper.sources.serpapi.query_serpapi_google_flights", return_value=MOCK_SERPAPI_PAYLOAD):
        res = scraper.fetch_quotes("DEL", "BOM", departure_date, "T+7")

    assert res.status == "success"
    assert res.source_type == "live"
    assert res.source == "google_flights"
    assert len(res.parsed_quotes) == 3


def test_serpapi_end_to_end_pipeline():
    """Verify end-to-end pipeline ingestion using SerpAPI scraper with real carrier mapping."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)

    with Session(engine) as session:
        scraper = SerpApiGoogleFlightsScraper()
        with patch("backend.app.scraper.sources.serpapi.query_serpapi_google_flights", return_value=MOCK_SERPAPI_PAYLOAD):
            res = run_pipeline_for_route(session, "DEL", "BOM", "T+7", scraper=scraper)

        assert res["status"] == "success"
        assert res["source_type"] == "live"
        assert res["quotes_stored"] == 3

        quotes = session.exec(select(FareQuote)).all()
        assert len(quotes) == 3
        sources = {q.source for q in quotes}
        assert sources == {"indigo", "akasa", "spicejet"}
        for q in quotes:
            assert q.source_type == "live"
            assert q.base_fare is None
            assert q.taxes is None
            assert q.route == "DEL-BOM"
