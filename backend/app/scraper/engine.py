"""
AeroCPI Scraper & ETL Pipeline Engine.
Implements:
- ARCHITECTURE.md Section 3 (End-to-End Pipeline: Scraping -> Raw Landing -> Cleaning -> DB)
- ARCHITECTURE.md Section 4.1 & 4.2 (Resilience against bot blocks & selector drift)
- User Requirement: Proven narrow slice (raw -> cleaned -> DB) with explicit source_type
"""
import logging
import datetime as dt
from typing import List, Optional
from sqlmodel import Session
from backend.app.models import RawSnapshot, FareQuote
from backend.app.etl.storage import save_raw_snapshot
from backend.app.etl.cleaner import clean_and_normalize_quotes
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.sources.indigo import IndiGoScraper

logger = logging.getLogger("aerocpi.pipeline")


def run_pipeline_for_route(
    session: Session,
    origin: str = "DEL",
    destination: str = "BOM",
    window: str = "T+7",
    scraper: Optional[BaseScraper] = None
) -> dict:
    """
    Run end-to-end pipeline for one route and one advance window.
    Step 1: Scrape raw response (with anti-bot & selector drift detection)
    Step 2: Save immutable raw snapshot with cryptographic hash to landing zone
    Step 3: Clean, normalize components, dedup, and apply IQR outlier filter
    Step 4: Save structured FareQuote records to DB with explicit source_type
    """
    route = f"{origin}-{destination}".upper()
    scraper = scraper or IndiGoScraper()
    
    # Calculate departure date based on window
    days_map = {"T+7": 7, "T+15": 15, "T+30": 30}
    advance_days = days_map.get(window.upper(), 7)
    departure_date = dt.date.today() + dt.timedelta(days=advance_days)
    
    logger.info(f"Executing pipeline: [{scraper.source_name.upper()}] {route} ({window}) for dep_date={departure_date}")

    # 1. Scrape raw
    scrape_res: ScrapeResult = scraper.fetch_quotes(origin, destination, departure_date, window)

    # 2. Save immutable raw snapshot
    snapshot: RawSnapshot = save_raw_snapshot(
        session=session,
        source=scrape_res.source,
        route=scrape_res.route,
        window=scrape_res.window,
        payload=scrape_res.raw_payload,
        source_type=scrape_res.source_type,
        status=scrape_res.status,
        flight_count=len(scrape_res.parsed_quotes)
    )

    # 3. Clean and normalize
    cleaned_quotes: List[FareQuote] = clean_and_normalize_quotes(
        raw_quotes=scrape_res.parsed_quotes,
        route=route,
        window=window,
        departure_date=departure_date,
        source=scrape_res.source,
        source_type=scrape_res.source_type,
        snapshot_id=snapshot.id
    )

    # 4. Save to DB
    for quote in cleaned_quotes:
        session.add(quote)
    session.commit()

    logger.info(f"Pipeline completed: saved {len(cleaned_quotes)} cleaned quotes (source_type={scrape_res.source_type}) for {route}")

    return {
        "status": "success",
        "route": route,
        "window": window,
        "source": scraper.source_name,
        "source_type": scrape_res.source_type,
        "raw_snapshot_id": snapshot.id,
        "raw_storage_path": snapshot.storage_path,
        "content_hash": snapshot.content_hash,
        "quotes_stored": len(cleaned_quotes),
        "scrape_status": scrape_res.status
    }
