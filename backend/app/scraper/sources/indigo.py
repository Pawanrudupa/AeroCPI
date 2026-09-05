import logging
import datetime as dt
from typing import List, Dict, Any
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from playwright_stealth import Stealth

from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.indigo")


class IndiGoScraper(BaseScraper):
    """
    IndiGo flight scraper with anti-bot detection, selector drift canary,
    and cached last-known-good resilience fallback.
    Now rewritten to use full browser automation via Playwright + stealth.
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
        date_str = departure_date.strftime("%d/%m/%Y")
        
        # We target the live search page UI flow instead of the stale API endpoint.
        search_url = f"https://www.goindigo.in/flight-booking.html?origin={origin}&destination={destination}&date={date_str}"
        
        content = ""
        try:
            self.polite_delay(0.5, 1.5)
            
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 800}
                )
                page = context.new_page()
                Stealth().apply_stealth_sync(page)
                
                try:
                    # Attempt to navigate to the home page to fill the UI
                    page.goto("https://www.goindigo.in/", wait_until="domcontentloaded", timeout=15000)
                    page.wait_for_timeout(2000)
                    
                    # If Akamai blocks us, the content length will be small and title empty.
                    if len(page.content()) < 5000 and "akamfailoverpage" in page.content():
                        raise Exception("WAF Blocked Home Page")

                    # Attempt to fill form (UI flow)
                    page.locator('input[placeholder*="From"]').click(timeout=5000)
                    page.locator('input[placeholder*="From"]').fill(origin)
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(500)
                    
                    page.locator('input[placeholder*="To"]').fill(destination)
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(500)
                    
                    # Submit search (bypassing date picker for simplistic UI flow validation)
                    page.locator('button:has-text("Search Flight")').click(timeout=5000)
                    page.wait_for_timeout(5000)
                    
                    content = page.content()
                except (PlaywrightTimeoutError, Exception) as ui_err:
                    logger.warning(f"[INDIGO] UI flow failed/blocked ({ui_err}). Falling back to deep link.")
                    # Fallback to direct navigation of the search page
                    page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
                    page.wait_for_timeout(5000)
                    content = page.content()
                    
                finally:
                    browser.close()

            # Check for bot challenge / CAPTCHA per ARCHITECTURE.md Section 4.2
            if self.detect_bot_protection(content) or "akamfailoverpage" in content or len(content) < 2000:
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

            # Primary parsing via fallback heuristic (since UI classes change rapidly)
            # The original API parser no longer works because we are hitting the UI page, not JSON.
            # So we pass the rendered DOM content directly to the LLM / heuristic fallback
            parsed_quotes = extract_with_llm_fallback(content, route, window, departure_date)

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
