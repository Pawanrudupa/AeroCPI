"""
AeroCPI Scraper LLM Fallback Extraction.
Implements:
- ARCHITECTURE.md Section 2 (LLM-based extraction fallback e.g. Gemini Flash)
- ARCHITECTURE.md Section 4.9 (Strictly fallback on primary-parse failure)
"""
import re
import json
import logging
import datetime as dt
from typing import List, Dict, Any, Optional
import httpx
from backend.app.config import settings

logger = logging.getLogger("aerocpi.scraper.fallback")


def extract_with_llm_fallback(
    raw_content: str,
    route: str,
    window: str,
    departure_date: dt.date
) -> List[Dict[str, Any]]:
    """
    Fallback extraction triggered strictly when primary selector-based DOM parsing fails.
    If GEMINI_API_KEY is configured, invokes Gemini Flash API.
    Otherwise, applies robust heuristic regex pattern-matching as a resilient local secondary fallback.
    """
    logger.warning(f"Primary selector parse failed for {route} ({window}). Triggering LLM/heuristic fallback.")

    if settings.GEMINI_API_KEY:
        try:
            return _call_gemini_flash_extractor(raw_content, route, window, departure_date)
        except Exception as e:
            logger.error(f"Gemini Flash extraction call failed: {e}. Falling back to heuristic text extractor.")
            
    return _heuristic_pattern_extractor(raw_content, route, window, departure_date)


def _call_gemini_flash_extractor(
    raw_content: str,
    route: str,
    window: str,
    departure_date: dt.date
) -> List[Dict[str, Any]]:
    """Calls Gemini Flash with a concise prompt to parse flight fares."""
    # Truncate raw content to 15,000 characters to stay within quick latency limits
    truncated_content = raw_content[:15000]
    
    prompt = f"""
    You are an expert flight fare data extraction engine.
    Extract all domestic flights from the following content for route {route} on date {departure_date.isoformat()}.
    Return ONLY a valid JSON array of objects with these keys:
    - carrier: string (e.g. "IndiGo", "Akasa Air", "SpiceJet", "Air India")
    - flight_number: string (e.g. "6E-501")
    - departure_time: string (e.g. "06:00")
    - arrival_time: string (e.g. "08:15")
    - total_fare: float (total price in INR)
    - base_fare: float or null
    - taxes: float or null

    Raw content snippet:
    {truncated_content}
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    response = httpx.post(
        url,
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=15.0
    )
    response.raise_for_status()
    result = response.json()
    
    text = result["candidates"][0]["content"]["parts"][0]["text"]
    # Extract JSON block
    match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if match:
        extracted = json.loads(match.group(0))
        return extracted
    return []


def _heuristic_pattern_extractor(
    raw_content: str,
    route: str,
    window: str,
    departure_date: dt.date
) -> List[Dict[str, Any]]:
    """
    Local heuristic parser used when LLM API key is not present or offline.
    Extracts flight numbers and rupee amounts from markup or text chunks.
    """
    results: List[Dict[str, Any]] = []
    
    # Common flight number patterns: 6E-1234, QP-123, SG-8114, AI-605
    flight_pattern = re.compile(r"\b(6E|QP|SG|AI|IX|UK)[-\s]?(\d{3,4})\b", re.IGNORECASE)
    # Price patterns: ₹ 4,599 or INR 4599 or "fare": 4599
    price_pattern = re.compile(r"(?:₹|INR|price|fare)[\s:\"]*([1-9]\d{0,1},?\d{3})", re.IGNORECASE)
    time_pattern = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
    
    carrier_map = {
        "6E": "IndiGo",
        "QP": "Akasa Air",
        "SG": "SpiceJet",
        "AI": "Air India",
        "IX": "Air India Express",
        "UK": "Vistara"
    }

    # Split into flight-sized segments or lines
    lines = raw_content.split("\n")
    for i, line in enumerate(lines):
        flight_match = flight_pattern.search(line)
        if flight_match:
            prefix = flight_match.group(1).upper()
            number = flight_match.group(2)
            carrier = carrier_map.get(prefix, "Domestic Airline")
            flight_no = f"{prefix}-{number}"
            
            # Scan nearby lines for price and times
            search_window = " ".join(lines[max(0, i - 2): min(len(lines), i + 5)])
            price_match = price_pattern.search(search_window)
            time_matches = time_pattern.findall(search_window)
            
            if price_match:
                price_str = price_match.group(1).replace(",", "")
                try:
                    price_val = float(price_str)
                    if 1500 <= price_val <= 45000:
                        dep_time = f"{time_matches[0][0]}:{time_matches[0][1]}" if len(time_matches) > 0 else "07:00"
                        arr_time = f"{time_matches[1][0]}:{time_matches[1][1]}" if len(time_matches) > 1 else "09:15"
                        
                        results.append({
                            "carrier": carrier,
                            "flight_number": flight_no,
                            "departure_time": dep_time,
                            "arrival_time": arr_time,
                            "total_fare": price_val,
                            "base_fare": round(price_val * 0.82, 2),
                            "taxes": round(price_val * 0.18, 2),
                            "currency": "INR"
                        })
                except ValueError:
                    continue

    return results
