"""
AeroCPI IndiGo Scraper Implementation.
Implements:
- ARCHITECTURE.md Section 2 (Scraping engine)
- ARCHITECTURE.md Section 4.1 (Selector drift handling & fallback to cached data)
- ARCHITECTURE.md Section 4.2 (Anti-bot detection & backoff)
- User Requirement: source_type accurately tagged ("live" vs "seeded")
"""
import logging
import datetime as dt
from typing import List, Dict, Any
import httpx
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.indigo")


class IndiGoScraper(BaseScraper):
    """
    IndiGo flight scraper with anti-bot detection, selector drift canary,
    and cached last-known-good resilience fallback.
    """

    def __init__(self):
        super().__init__("indigo")

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
        headers["Referer"] = "https://www.goindigo.in/"
        
        # Primary live search endpoint (IndiGo flight search / lightweight web interface)
        search_url = f"https://www.goindigo.in/flight-booking.html?origin={origin}&destination={destination}&date={date_str}"
        api_search_url = f"https://www.goindigo.in/api/flight/search?origin={origin}&destination={destination}&date={date_str}"

        try:
            # Respect ethical rate-limiting delay
            self.polite_delay(0.5, 1.5)
            
            with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                try:
                    response = client.get(api_search_url, headers=headers)
                except httpx.HTTPError:
                    response = client.get(search_url, headers=headers)

            content = response.text

            # Check for bot challenge / CAPTCHA per ARCHITECTURE.md Section 4.2
            if response.status_code in (403, 429) or self.detect_bot_protection(content):
                logger.warning(f"[INDIGO] Rate limit or Bot challenge detected for {route}. Invoking resilient cached fallback.")
                seeded_data = get_seeded_snapshot(route, window, source="indigo")
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload={"fallback_reason": "bot_detection_or_rate_limit", "cached_flights": seeded_data},
                    parsed_quotes=seeded_data,
                    source_type="seeded",
                    status="bot_detected"
                )

            # Attempt primary selector / JSON parsing
            parsed_quotes = self._parse_indigo_response(content, route, departure_date)
            
            # Canary test: if primary parsing returned zero flights from valid response,
            # selector drift has occurred! Trigger LLM fallback per ARCHITECTURE.md Section 4.1 & 4.9
            if not parsed_quotes:
                logger.info(f"[INDIGO] Primary selector found 0 quotes on {route}. Triggering fallback parser.")
                parsed_quotes = extract_with_llm_fallback(content, route, window, departure_date)

            # If still empty (e.g. site empty/changed completely), use last-known-good seeded data
            if not parsed_quotes:
                logger.warning(f"[INDIGO] All extraction paths exhausted for {route}. Falling back to seeded baseline.")
                seeded_data = get_seeded_snapshot(route, window, source="indigo")
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload={"fallback_reason": "selector_drift_exhausted", "cached_flights": seeded_data},
                    parsed_quotes=seeded_data,
                    source_type="seeded",
                    status="fallback_used"
                )

            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload=content[:20000],  # store snapshot snippet
                parsed_quotes=parsed_quotes,
                source_type="live",
                status="success"
            )

        except Exception as exc:
            # Plausible error handling: network outage, DNS failure, connection timeout
            logger.error(f"[INDIGO] Scrape error for {route} ({window}): {exc}. Engaging seeded fallback.", exc_info=False)
            seeded_data = get_seeded_snapshot(route, window, source="indigo")
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload={"fallback_reason": f"network_exception: {str(exc)}", "cached_flights": seeded_data},
                parsed_quotes=seeded_data,
                source_type="seeded",
                status="error",
                error=str(exc)
            )

    def _parse_indigo_response(self, content: str, route: str, departure_date: dt.date) -> List[Dict[str, Any]]:
        """Primary JSON/HTML parser for IndiGo."""
        import json
        try:
            data = json.loads(content)
            # If JSON structure is present
            flights = data.get("flights") or data.get("data", {}).get("flights", [])
            results = []
            for f in flights:
                price = f.get("totalFare") or f.get("fare")
                if price:
                    results.append({
                        "carrier": "IndiGo",
                        "flight_number": f.get("flightNumber", "6E-000"),
                        "departure_time": f.get("departureTime", "08:00"),
                        "arrival_time": f.get("arrivalTime", "10:15"),
                        "base_fare": float(f.get("baseFare", float(price) * 0.82)),
                        "taxes": float(f.get("taxes", float(price) * 0.18)),
                        "total_fare": float(price),
                        "currency": "INR"
                    })
            return results
        except Exception:
            return []
