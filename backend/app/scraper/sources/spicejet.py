"""
AeroCPI SpiceJet Scraper Implementation.
Implements:
- ARCHITECTURE.md Section 2 (Scraping engine)
- Direct airline source: SpiceJet (carrier SG)
- User Requirement: source_type ("live" vs "seeded")
"""
import logging
import datetime as dt
from typing import List, Dict, Any
import httpx
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.spicejet")


class SpiceJetScraper(BaseScraper):
    """
    SpiceJet direct airline scraper with anti-bot challenge detection
    and resilient calibrated fallback.
    """

    def __init__(self):
        super().__init__("spicejet")

    def fetch_quotes(
        self,
        origin: str,
        destination: str,
        departure_date: dt.date,
        window: str
    ) -> ScrapeResult:
        route = f"{origin}-{destination}".upper()
        date_str = departure_date.strftime("%Y-%m-%d")
        headers = self.get_random_headers()
        headers["Referer"] = "https://www.spicejet.com/"
        
        search_url = f"https://www.spicejet.com/search?from={origin}&to={destination}&tripType=1&departure={date_str}"

        try:
            self.polite_delay(0.5, 1.5)
            with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                response = client.get(search_url, headers=headers)
                
            content = response.text
            if response.status_code in (403, 429) or self.detect_bot_protection(content):
                logger.warning(f"[SPICEJET] Bot challenge / rate limit on {route}. Engaging seeded fallback.")
                seeded_data = get_seeded_snapshot(route, window, source="spicejet")
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

            # Extract via primary or fallback parser
            parsed_quotes = extract_with_llm_fallback(content, route, window, departure_date)
            if not parsed_quotes:
                seeded_data = get_seeded_snapshot(route, window, source="spicejet")
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload={"fallback": "empty_extract", "flights": seeded_data},
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
            logger.error(f"[SPICEJET] Fetch failed for {route}: {exc}. Using seeded snapshot.", exc_info=False)
            seeded_data = get_seeded_snapshot(route, window, source="spicejet")
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
