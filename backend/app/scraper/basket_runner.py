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
from backend.app.scraper.sources.serpapi import SerpApiGoogleFlightsScraper
from backend.app.config import settings
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
    """Instantiate all configured scrapers, including SerpAPI Google Flights when configured."""
    scrapers = [
        IndiGoScraper(),
        AkasaScraper(),
        SpiceJetScraper(),
        EaseMyTripScraper(),
        CleartripScraper(),
        MakeMyTripScraper(),
    ]
    if settings.serpapi_key:
        scrapers.append(SerpApiGoogleFlightsScraper())
    return scrapers


def run_full_basket_pipeline(
    session: Session,
    limit_sources: bool = False,
    routes: Optional[List[tuple]] = None,
    windows: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Execute scrape and ETL pipeline across specified or all city-pairs and advance windows.
    Executes across configured sources (airlines, OTAs, and SerpAPI Google Flights).
    Checks event_bus.should_stop() before each step to cleanly halt if requested by user.
    """
    from backend.app.events import event_bus, PipelineEvent, EventType

    scrapers = get_all_scrapers()
    target_routes = routes or BASKET_ROUTES
    target_windows = windows or ADVANCE_WINDOWS

    summary_results = []
    for origin, dest in target_routes:
        for window in target_windows:
            for scraper in scrapers:
                if event_bus.should_stop():
                    logger.info("Pipeline stop signal received. Halting further scraper execution.")
                    event_bus.publish(PipelineEvent(
                        event_type=EventType.PIPELINE_STOPPED,
                        message="PIPELINE STOPPED BY OPERATOR :: PROGRESS PRESERVED",
                        route=f"{origin}-{dest}"
                    ))
                    return summary_results

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
