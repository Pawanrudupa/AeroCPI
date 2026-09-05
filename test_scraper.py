import sys
import datetime as dt
import os
sys.path.append("c:\\Users\\PAWAN\\OneDrive\\Pictures\\Screenshots\\myproject")

from backend.app.scraper.sources.indigo import IndiGoScraper
from backend.app.scraper.sources.akasa import AkasaScraper
from backend.app.scraper.sources.easemytrip import EaseMyTripScraper
import logging

logging.basicConfig(level=logging.INFO)

def test_source(scraper, origin="DEL", dest="BOM"):
    print(f"\n--- Testing {scraper.source_name} ---")
    dep_date = dt.date.today() + dt.timedelta(days=7)
    try:
        res = scraper.fetch_quotes(origin, dest, dep_date, "T+7")
        print(f"Status: {res.status}")
        print(f"Source Type: {res.source_type}")
        print(f"Quotes extracted: {len(res.parsed_quotes)}")
        if res.error:
            print(f"Error: {res.error}")
        if res.status != "success":
            print(f"Raw payload/reason: {res.raw_payload}")
        else:
            print(f"Raw payload preview: {str(res.raw_payload)[:200]}")
    except Exception as e:
        print(f"Exception during testing: {e}")

indigo = IndiGoScraper()
test_source(indigo)

akasa = AkasaScraper()
test_source(akasa)

emt = EaseMyTripScraper()
test_source(emt)
