"""
AeroCPI Akasa Air Scraper Implementation.
Implements:
- ARCHITECTURE.md Section 2 (Scraping engine)
- ARCHITECTURE.md Section 5 (Step 3: Multi-source scaling)
- User Requirement: source_type ("live" vs "seeded")
"""
import logging
import datetime as dt
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from playwright_stealth import Stealth
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.fallback import extract_with_llm_fallback
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.akasa")


class AkasaScraper(BaseScraper):
    """
    Akasa Air flight scraper. 
    Uses Playwright browser automation and stealth.
    """

    def __init__(self):
        super().__init__("akasa")

    def fetch_quotes(
        self,
        origin: str,
        destination: str,
        departure_date: dt.date,
        window: str
    ) -> ScrapeResult:
        route = f"{origin}-{destination}".upper()
        date_str = departure_date.strftime("%Y-%m-%d")
        
        search_url = f"https://www.akasaair.com/search-flights?origin={origin}&destination={destination}&date={date_str}"
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
                    # Attempt UI Flow on home page
                    page.goto("https://www.akasaair.com/", wait_until="domcontentloaded", timeout=15000)
                    page.wait_for_timeout(2000)
                    
                    page.locator('input[placeholder="From"]').click(timeout=5000)
                    page.locator('input[placeholder="From"]').fill(origin)
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(500)
                    
                    page.locator('input[placeholder="To"]').fill(destination)
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(500)
                    
                    page.locator('button:has-text("Search")').click(timeout=5000)
                    
                    try:
                        page.wait_for_function(
                            '() => document.body.innerText.includes("QP-") || document.body.innerText.includes("₹")',
                            timeout=15000
                        )
                    except PlaywrightTimeoutError:
                        pass
                        
                    page.wait_for_timeout(2000)
                    content = page.content()
                    
                except (PlaywrightTimeoutError, Exception) as ui_err:
                    logger.warning(f"[AKASA] UI flow failed ({ui_err}). Falling back to deep link.")
                    page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
                    
                    try:
                        page.wait_for_function(
                            '() => document.body.innerText.includes("QP-") || document.body.innerText.includes("₹")',
                            timeout=15000
                        )
                    except PlaywrightTimeoutError:
                        pass
                        
                    page.wait_for_timeout(2000)
                    content = page.content()
                finally:
                    browser.close()

            if self.detect_bot_protection(content) or "403 Forbidden" in content or "Access Denied" in content:
                logger.warning(f"[AKASA] Bot challenge / rate limit on {route}. Engaging seeded fallback.")
                seeded_data = get_seeded_snapshot(route, window, source="akasa")
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

            parsed_quotes = extract_with_llm_fallback(content, route, window, departure_date)

            if not parsed_quotes:
                logger.warning(f"[AKASA] Extractor found 0 flights for {route}. Falling back.")
                seeded_data = get_seeded_snapshot(route, window, source="akasa")
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
            logger.error(f"[AKASA] Scrape error {route}: {exc}")
            seeded_data = get_seeded_snapshot(route, window, source="akasa")
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload={"fallback": "network_err", "flights": seeded_data},
                parsed_quotes=seeded_data,
                source_type="seeded",
                status="error",
                error=str(exc)
            )
