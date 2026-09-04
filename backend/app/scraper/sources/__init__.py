"""
AeroCPI Scraper Sources Package.
Provides scrapers for 6 distinct data origins:
- 3 Airlines: IndiGo, Akasa Air, SpiceJet
- 3 OTAs: EaseMyTrip, Cleartrip, MakeMyTrip
"""
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.sources.indigo import IndiGoScraper
from backend.app.scraper.sources.akasa import AkasaScraper
from backend.app.scraper.sources.spicejet import SpiceJetScraper
from backend.app.scraper.sources.easemytrip import EaseMyTripScraper
from backend.app.scraper.sources.cleartrip import CleartripScraper
from backend.app.scraper.sources.makemytrip import MakeMyTripScraper

__all__ = [
    "BaseScraper",
    "ScrapeResult",
    "IndiGoScraper",
    "AkasaScraper",
    "SpiceJetScraper",
    "EaseMyTripScraper",
    "CleartripScraper",
    "MakeMyTripScraper",
]
