"""
AeroCPI EaseMyTrip Scraper Implementation.
Implements:
- ARCHITECTURE.md Section 2 (OTA Scraper)
- ARCHITECTURE.md Section 5 (Step 3: Multi-source scaling)
- User Requirement: source_type ("live" vs "seeded")
"""
import logging
import datetime as dt
from typing import List, Dict, Any
import httpx
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.easemytrip")


class EaseMyTripScraper(BaseScraper):
    """
    EaseMyTrip OTA scraper with anti-bot detection and seeded fallback.
    """

    def __init__(self):
        super().__init__("easemytrip")

    def fetch_quotes(
        self,
        origin: str,
        destination: str,
        departure_date: dt.date,
        window: str
    ) -> ScrapeResult:
        route = f"{origin}-{destination}".upper()
        date_str = departure_date.strftime("%d/%m/%Y")
        headers = self.get_random_headers()
        headers["Referer"] = "https://www.easemytrip.com/"
        
        search_url = f"https://flight.easemytrip.com/FlightList/Index?srch={origin}-{destination}-{date_str}"

        try:
            self.polite_delay(0.5, 1.5)
            with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                response = client.get(search_url, headers=headers)
                
            content = response.text
            if response.status_code in (403, 429) or self.detect_bot_protection(content):
                logger.warning(f"[EASEMYTRIP] Bot protection or rate limit on {route}. Engaging seeded fallback.")
                seeded_data = get_seeded_snapshot(route, window)
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload={"fallback": "bot_protection", "flights": seeded_data},
                    parsed_quotes=seeded_data,
                    source_type="seeded",
                    status="bot_detected"
                )

            # Heuristic / fallback extraction
            parsed_quotes = extract_with_llm_fallback(content, route, window, departure_date)
            if not parsed_quotes:
                seeded_data = get_seeded_snapshot(route, window)
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload={"fallback": "selector_drift", "flights": seeded_data},
                    parsed_quotes=seeded_data,
                    source_type="seeded",
                    status="fallback_used"
                )

            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload=content[:20000],
                parsed_quotes=parsed_quotes,
                source_type="live",
                status="success"
            )

        except Exception as exc:
            logger.error(f"[EASEMYTRIP] Error fetching {route}: {exc}. Using seeded snapshot.", exc_info=False)
            seeded_data = get_seeded_snapshot(route, window)
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload={"fallback": f"exception: {exc}", "flights": seeded_data},
                parsed_quotes=seeded_data,
                source_type="seeded",
                status="error",
                error=str(exc)
            )
