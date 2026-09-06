"""
AeroCPI SerpAPI Google Flights Integration.
Implements:
- Live real-world fare collection via Google Flights API (SerpAPI)
- Multi-carrier aggregation (IndiGo, Akasa Air, SpiceJet, Air India, etc.)
- Transparent provenance tagging: source_type="live"
- Rate limiting and error resilience
"""
import logging
import json
import urllib.request
import urllib.parse
import urllib.error
import datetime as dt
from typing import List, Dict, Any, Optional

from backend.app.config import settings
from backend.app.scraper.sources.base import BaseScraper, ScrapeResult
from backend.app.scraper.seed_data import get_seeded_snapshot

logger = logging.getLogger("aerocpi.scraper.serpapi")

SERPAPI_ENDPOINT = "https://serpapi.com/search.json"


_SERPAPI_CACHE: Dict[str, Dict[str, Any]] = {}


def clear_serpapi_cache():
    """Clear the in-memory cache of SerpAPI responses."""
    global _SERPAPI_CACHE
    _SERPAPI_CACHE.clear()


def query_serpapi_google_flights(
    origin: str,
    destination: str,
    departure_date: dt.date,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Execute raw HTTP query to SerpAPI Google Flights engine.
    Caches responses in-memory by (origin, destination, date) to conserve API search quota.
    """
    key = api_key or settings.serpapi_key
    if not key:
        raise ValueError("SERPAPI_API_KEY is not configured in environment or settings.")

    cache_key = f"{origin.upper()}_{destination.upper()}_{departure_date.strftime('%Y-%m-%d')}"
    if cache_key in _SERPAPI_CACHE:
        logger.info(f"[SERPAPI CACHE HIT] Reusing Google Flights query for {origin}->{destination} on {departure_date}")
        return _SERPAPI_CACHE[cache_key]

    params = {
        "engine": "google_flights",
        "departure_id": origin.upper(),
        "arrival_id": destination.upper(),
        "outbound_date": departure_date.strftime("%Y-%m-%d"),
        "currency": "INR",
        "hl": "en",
        "type": "2",  # One-way
        "api_key": key
    }
    url = f"{SERPAPI_ENDPOINT}?{urllib.parse.urlencode(params)}"
    
    logger.info(f"[SERPAPI] Fetching Google Flights for {origin}->{destination} on {departure_date}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "AeroCPI-Data-Engine/1.0 (Compliance/Airfare-Index)"}
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"SerpAPI returned HTTP {response.status}")
        raw_bytes = response.read()
        data = json.loads(raw_bytes.decode("utf-8"))
        _SERPAPI_CACHE[cache_key] = data
        return data


def parse_serpapi_flight_items(
    payload: Dict[str, Any],
    route: str,
    window: str,
    departure_date: dt.date,
    target_carrier: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Parse best_flights and other_flights from SerpAPI Google Flights response into
    AeroCPI normalized flight quote dictionaries.
    """
    flights_list = payload.get("best_flights", []) + payload.get("other_flights", [])
    quotes: List[Dict[str, Any]] = []

    for item in flights_list:
        price = item.get("price")
        if not price or not isinstance(price, (int, float)) or price <= 0:
            continue

        flight_segments = item.get("flights", [])
        if not flight_segments:
            continue

        first_seg = flight_segments[0]
        airline = first_seg.get("airline", "Unknown")
        flight_number = first_seg.get("flight_number")
        travel_class = first_seg.get("travel_class", "Economy").lower()

        # Map airline to canonical source key for the 6-source basket matrix
        airline_norm = airline.strip().lower()
        if "indigo" in airline_norm:
            canonical_source = "indigo"
        elif "akasa" in airline_norm:
            canonical_source = "akasa"
        elif "spicejet" in airline_norm:
            canonical_source = "spicejet"
        else:
            canonical_source = "google_flights"

        # Optional carrier filter (e.g. for IndiGo, Akasa, SpiceJet specific scrapers)
        if target_carrier:
            target_norm = target_carrier.strip().lower()
            if target_norm not in airline_norm and airline_norm not in target_norm:
                continue

        # Extract departure & arrival times
        dep_time_raw = first_seg.get("departure_airport", {}).get("time", "")
        arr_time_raw = flight_segments[-1].get("arrival_airport", {}).get("time", "")

        dep_time = dep_time_raw.split(" ")[-1] if " " in dep_time_raw else dep_time_raw
        arr_time = arr_time_raw.split(" ")[-1] if " " in arr_time_raw else arr_time_raw

        total_fare = float(price)
        # Metasearch aggregators (Google Flights via SerpAPI) return the verified all-inclusive
        # total fare. They do not report separate base fare vs tax breakdowns.
        # Strict data integrity policy: do NOT synthesize an estimated percentage split.
        # Unknown components remain None.

        quotes.append({
            "route": route,
            "carrier": airline,
            "source": canonical_source,
            "flight_number": flight_number,
            "window": window,
            "departure_date": departure_date,
            "departure_time": dep_time or None,
            "arrival_time": arr_time or None,
            "fare_class": travel_class,
            "base_fare": None,
            "taxes": None,
            "total_fare": total_fare,
            "currency": "INR",
            "acquisition_channel": "serpapi_google_flights"
        })

    return quotes


class SerpApiGoogleFlightsScraper(BaseScraper):
    """
    Live real-world scraper using SerpAPI Google Flights engine.
    Returns 100% verified LIVE flight quotes tagged with source_type='live'.
    """

    def __init__(self, source_name: str = "google_flights", target_carrier: Optional[str] = None):
        super().__init__(source_name)
        self.target_carrier = target_carrier

    def fetch_quotes(
        self,
        origin: str,
        destination: str,
        departure_date: dt.date,
        window: str
    ) -> ScrapeResult:
        route = f"{origin}-{destination}".upper()

        if not settings.serpapi_key:
            logger.warning("[SERPAPI] No API key configured. Invoking seeded fallback.")
            seeded_data = get_seeded_snapshot(route, window, source=self.source_name)
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload={"fallback_reason": "missing_serpapi_key", "cached_flights": seeded_data},
                parsed_quotes=seeded_data,
                source_type="seeded",
                status="missing_api_key"
            )

        try:
            self.polite_delay(0.2, 0.5)
            payload = query_serpapi_google_flights(origin, destination, departure_date)
            parsed_quotes = parse_serpapi_flight_items(
                payload=payload,
                route=route,
                window=window,
                departure_date=departure_date,
                target_carrier=self.target_carrier
            )

            if not parsed_quotes:
                logger.warning(f"[SERPAPI] 0 flights found for {route} on {departure_date}.")
                return ScrapeResult(
                    source=self.source_name,
                    route=route,
                    window=window,
                    departure_date=departure_date,
                    raw_payload=payload,
                    parsed_quotes=[],
                    source_type="live",
                    status="no_flights_found"
                )

            logger.info(f"[SERPAPI] Captured {len(parsed_quotes)} LIVE quotes for {route} ({window})")
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload=payload,
                parsed_quotes=parsed_quotes,
                source_type="live",
                status="success"
            )

        except Exception as e:
            logger.error(f"[SERPAPI] Error querying Google Flights for {route}: {e}")
            seeded_data = get_seeded_snapshot(route, window, source=self.source_name)
            return ScrapeResult(
                source=self.source_name,
                route=route,
                window=window,
                departure_date=departure_date,
                raw_payload={"error": str(e), "cached_flights": seeded_data},
                parsed_quotes=seeded_data,
                source_type="seeded",
                status="fallback_used",
                error=str(e)
            )
