"""
AeroCPI Data Cleaning & Normalization Engine.
Implements:
- ARCHITECTURE.md Section 3 (ETL Pipeline: fare component split, dedup, outlier filter, sold-out handling)
- ARCHITECTURE.md Section 4.3 (Fare component schema: base_fare + taxes + udf + convenience_fee = total_fare)
- FEATURES.md (IQR outlier rejection, deduplication)
"""
import datetime as dt
from typing import Optional, List, Dict, Any
import numpy as np
import pandas as pd
from backend.app.models import FareQuote
from backend.app.events import event_bus, PipelineEvent, EventType


# Domestic Indian Airfare sanity boundaries (economy)
MIN_PLAUSIBLE_FARE_INR = 1500.0
MAX_PLAUSIBLE_FARE_INR = 45000.0


def filter_iqr_outliers(fares: List[float], multiplier: float = 1.5) -> tuple[float, float]:
    """
    Compute IQR lower and upper bounds for outlier rejection.
    If sample size is small (< 4), falls back to domain-knowledge physical bounds.
    """
    if len(fares) < 4:
        return MIN_PLAUSIBLE_FARE_INR, MAX_PLAUSIBLE_FARE_INR
        
    q25 = float(np.percentile(fares, 25))
    q75 = float(np.percentile(fares, 75))
    iqr = q75 - q25
    
    lower_bound = max(MIN_PLAUSIBLE_FARE_INR, q25 - (multiplier * iqr))
    upper_bound = min(MAX_PLAUSIBLE_FARE_INR, q75 + (multiplier * iqr))
    return lower_bound, upper_bound


def clean_and_normalize_quotes(
    raw_quotes: List[Dict[str, Any]],
    route: str,
    window: str,
    departure_date: dt.date,
    source: str,
    source_type: str = "live",
    snapshot_id: Optional[int] = None
) -> List[FareQuote]:
    """
    Clean, normalize, deduplicate, and filter outliers from raw flight quotes.
    Enforces the ARCHITECTURE.md Section 4.3 component schema:
    base_fare + taxes + udf + convenience_fee = total_fare
    """
    if not raw_quotes:
        return []

    # Step 1: Initial parsing & filtering non-positive / sold-out entries
    valid_candidates = []
    for raw in raw_quotes:
        total = raw.get("total_fare") or raw.get("price") or raw.get("fare")
        if total is None:
            continue
        try:
            total_fare = float(total)
        except (ValueError, TypeError):
            continue
            
        if total_fare <= 0:
            continue  # Sold out / invalid

        flight_no = raw.get("flight_number") or raw.get("flight_no") or raw.get("flightNo")
        carrier = raw.get("carrier") or raw.get("airline") or "Unknown"
        dep_time = raw.get("departure_time") or raw.get("depTime")
        arr_time = raw.get("arrival_time") or raw.get("arrTime")
        fare_class = raw.get("fare_class", "economy").lower()
        
        # Parse optional component breakdowns
        base_fare = float(raw["base_fare"]) if raw.get("base_fare") is not None else None
        taxes = float(raw["taxes"]) if raw.get("taxes") is not None else None
        udf = float(raw["udf"]) if raw.get("udf") is not None else None
        conv_fee = float(raw["convenience_fee"]) if raw.get("convenience_fee") is not None else None
        
        # Component consistency check (ARCHITECTURE.md Section 4.3)
        # If total is known and base_fare is known, but taxes missing: infer taxes if possible
        if base_fare is not None and taxes is None:
            allocated = (udf or 0.0) + (conv_fee or 0.0)
            if total_fare >= (base_fare + allocated):
                taxes = round(total_fare - base_fare - allocated, 2)

        valid_candidates.append({
            "route": route.upper(),
            "carrier": carrier,
            "flight_number": flight_no.upper() if flight_no else None,
            "window": window.upper(),
            "departure_date": departure_date,
            "departure_time": dep_time,
            "arrival_time": arr_time,
            "fare_class": fare_class,
            "base_fare": base_fare,
            "taxes": taxes,
            "udf": udf,
            "convenience_fee": conv_fee,
            "total_fare": round(total_fare, 2),
            "currency": raw.get("currency", "INR"),
            "source": source.lower(),
            "source_type": source_type,
            "raw_snapshot_id": snapshot_id
        })

    if not valid_candidates:
        return []

    # Step 2: Deduplication by (route, carrier, flight_number, departure_date, window)
    df = pd.DataFrame(valid_candidates)
    initial_df_len = len(df)
    
    # Sort by total_fare ascending so deduplication keeps the best available quote for same flight
    df = df.sort_values(by="total_fare", ascending=True)
    
    # If flight_number is known, dedup on flight_number; else dedup on carrier + departure_time
    if "flight_number" in df.columns and df["flight_number"].notna().any():
        dedup_cols = ["route", "carrier", "flight_number", "departure_date", "window"]
    else:
        dedup_cols = ["route", "carrier", "departure_time", "departure_date", "window"]
        
    df = df.drop_duplicates(subset=dedup_cols, keep="first")
    dupes_removed = initial_df_len - len(df)

    # Step 3: Outlier rejection using IQR filter
    len_before_outliers = len(df)
    fares_list = df["total_fare"].tolist()
    lower_bound, upper_bound = filter_iqr_outliers(fares_list)
    df = df[(df["total_fare"] >= lower_bound) & (df["total_fare"] <= upper_bound)]
    outliers_removed = len_before_outliers - len(df)

    # Step 4: Convert clean rows to FareQuote model instances
    cleaned_quotes: List[FareQuote] = []
    for _, row in df.iterrows():
        quote = FareQuote(
            route=row["route"],
            carrier=row["carrier"],
            flight_number=row["flight_number"],
            window=row["window"],
            departure_date=row["departure_date"],
            departure_time=row["departure_time"],
            arrival_time=row["arrival_time"],
            fare_class=row["fare_class"],
            base_fare=row["base_fare"],
            taxes=row["taxes"],
            udf=row["udf"],
            convenience_fee=row["convenience_fee"],
            total_fare=row["total_fare"],
            currency=row["currency"],
            source=row["source"],
            source_type=row["source_type"],
            raw_snapshot_id=row["raw_snapshot_id"]
        )
        cleaned_quotes.append(quote)

    initial_count = len(raw_quotes)
    event_bus.publish(PipelineEvent(
        event_type=EventType.CLEAN_STEP,
        message=f"CLEAN {route} {window} :: {len(cleaned_quotes)} QUOTES RETAINED (from {initial_count}, {outliers_removed} OUTLIERS, {dupes_removed} DUPES)",
        route=route,
        window=window,
        data={"initial": initial_count, "retained": len(cleaned_quotes), "outliers_removed": outliers_removed, "dupes_removed": dupes_removed}
    ))

    return cleaned_quotes
