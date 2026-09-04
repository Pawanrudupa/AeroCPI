"""
AeroCPI Basket Orchestrator.
Implements:
- FEATURES.md Must-Have Basket:
  - 6 City-pairs: DEL-BOM, DEL-BLR, BOM-BLR, DEL-CCU, BLR-HYD, MAA-DEL
  - 3 Advance Windows: T+7, T+15, T+30
  - 6 Sources: 3 Airlines (IndiGo, Akasa Air, SpiceJet) + 3 OTAs (EaseMyTrip, Cleartrip, MakeMyTrip)
- User Requirement: Tag every quote with exact source_type ("live" vs "seeded")
"""
import logging
from typing import List, Dict, Any
from sqlmodel import Session
from backend.app.scraper.sources.indigo import IndiGoScraper
from backend.app.scraper.sources.akasa import AkasaScraper
from backend.app.scraper.sources.spicejet import SpiceJetScraper
from backend.app.scraper.sources.easemytrip import EaseMyTripScraper
from backend.app.scraper.sources.cleartrip import CleartripScraper
from backend.app.scraper.sources.makemytrip import MakeMyTripScraper
from backend.app.scraper.engine import run_pipeline_for_route

logger = logging.getLogger("aerocpi.basket")

BASKET_ROUTES = [
    ("DEL", "BOM"),
    ("DEL", "BLR"),
    ("BOM", "BLR"),
    ("DEL", "CCU"),
    ("BLR", "HYD"),
    ("MAA", "DEL")
]

ADVANCE_WINDOWS = ["T+7", "T+15", "T+30"]


def get_all_scrapers():
    """Instantiate all 6 configured scrapers."""
    return [
        IndiGoScraper(),
        AkasaScraper(),
        SpiceJetScraper(),
        EaseMyTripScraper(),
        CleartripScraper(),
        MakeMyTripScraper(),
    ]


def run_full_basket_pipeline(session: Session, limit_sources: bool = False) -> List[Dict[str, Any]]:
    """
    Execute scrape and ETL pipeline across all city-pairs and advance windows.
    Executes across all 6 sources (3 direct airlines + 3 OTAs) to ensure complete basket coverage.
    """
    scrapers = get_all_scrapers()

    summary_results = []
    for origin, dest in BASKET_ROUTES:
        for window in ADVANCE_WINDOWS:
            for scraper in scrapers:
                try:
                    res = run_pipeline_for_route(
                        session=session,
                        origin=origin,
                        destination=dest,
                        window=window,
                        scraper=scraper
                    )
                    summary_results.append(res)
                except Exception as e:
                    logger.error(f"Failed pipeline for {origin}-{dest} {window} on {scraper.source_name}: {e}")
                    
    return summary_results
