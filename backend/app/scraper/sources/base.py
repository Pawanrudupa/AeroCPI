"""
AeroCPI Base Scraper Interface.
Implements:
- ARCHITECTURE.md Section 1 (Ethical scraping, rate limiting, anti-bot handling)
- ARCHITECTURE.md Section 4.1 & 4.2 (CAPTCHA detect -> skip -> log -> retry with backoff; fallback to cached snapshot)
- User Requirement: explicit source_type ("live" vs "seeded")
"""
import abc
import random
import time
import logging
import datetime as dt
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

logger = logging.getLogger("aerocpi.scraper")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0"
]

BOT_SIGNATURES = [
    "cf-browser-verification",
    "cf-challenge-running",
    "challenge-running",
    "perimeterx",
    "captcha",
    "turnstile",
    "access denied",
    "please verify you are human",
    "incident id",
    "datadome"
]


@dataclass
class ScrapeResult:
    source: str
    route: str
    window: str
    departure_date: dt.date
    raw_payload: Any
    parsed_quotes: List[Dict[str, Any]] = field(default_factory=list)
    source_type: str = "live"  # "live" | "seeded"
    status: str = "success"  # "success", "bot_detected", "fallback_used", "error"
    error: Optional[str] = None


class BaseScraper(abc.ABC):
    """Abstract base scraper with anti-bot detection and polite rate-limiting."""

    def __init__(self, source_name: str):
        self.source_name = source_name.lower()

    def get_random_headers(self) -> Dict[str, str]:
        """Generate randomized browser headers to minimize static fingerprinting."""
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1"
        }

    def detect_bot_protection(self, content: str) -> bool:
        """
        Check if the retrieved HTML/text matches known bot/CAPTCHA challenges.
        ARCHITECTURE.md Section 4.2: Detect -> Skip -> Log -> Retry with backoff.
        """
        lower = content.lower()
        for signature in BOT_SIGNATURES:
            if signature in lower:
                logger.warning(f"[{self.source_name.upper()}] Bot challenge detected: '{signature}'")
                return True
        return False

    def polite_delay(self, min_seconds: float = 0.5, max_seconds: float = 2.0):
        """Inject randomized delays to comply with ethical scraping limits."""
        time.sleep(random.uniform(min_seconds, max_seconds))

    @abc.abstractmethod
    def fetch_quotes(
        self,
        origin: str,
        destination: str,
        departure_date: dt.date,
        window: str
    ) -> ScrapeResult:
        """Fetch quotes for a given city pair and date."""
        pass
