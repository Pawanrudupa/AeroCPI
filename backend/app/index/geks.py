"""
AeroCPI GEKS-Törnqvist Multilateral Price Index Engine.
Implements:
- ARCHITECTURE.md Section 2 (Pure-function module: GEKS-Törnqvist multilateral price index)
- ARCHITECTURE.md Section 4.4 (Weighting via DGCA passenger-traffic share 'PSD')
- FEATURES.md (Daily index computation, derive weekly/monthly by aggregation)
"""
import math
import logging
import datetime as dt
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sqlmodel import Session, select
from backend.app.models import FareQuote, IndexDaily, IndexRoute
from backend.app.events import event_bus, PipelineEvent, EventType

logger = logging.getLogger("aerocpi.index.geks")

# DGCA Passenger Traffic Share Weights (PSD) for the 6 core routes
# Normalized from DGCA Domestic Passenger Traffic Statistics
DGCA_ROUTE_WEIGHTS: Dict[str, float] = {
    "DEL-BOM": 0.24,  # Delhi - Mumbai (highest passenger density)
    "DEL-BLR": 0.20,  # Delhi - Bengaluru
    "BOM-BLR": 0.18,  # Mumbai - Bengaluru
    "DEL-CCU": 0.15,  # Delhi - Kolkata
    "BLR-HYD": 0.12,  # Bengaluru - Hyderabad
    "MAA-DEL": 0.11,  # Chennai - Delhi
}


def normalize_weights(weights: Dict[str, float], available_routes: List[str]) -> Dict[str, float]:
    """Normalize route weights so they sum to 1.0 across available routes."""
    subset = {r: weights.get(r, 1.0 / len(available_routes)) for r in available_routes}
    total_w = sum(subset.values())
    if total_w <= 0:
        return {r: 1.0 / len(available_routes) for r in available_routes}
    return {r: w / total_w for r, w in subset.items()}


def compute_tornqvist_log_ratio(
    prices_0: Dict[str, float],
    prices_t: Dict[str, float],
    weights: Dict[str, float]
) -> float:
    """
    Compute ln(P_T(0, t)) using bilateral Törnqvist formula:
    ln(P_T) = sum_{i} w_i * ln(p_{i, t} / p_{i, 0})
    """
    common_routes = [r for r in prices_0 if r in prices_t and prices_0[r] > 0 and prices_t[r] > 0]
    if not common_routes:
        return 0.0

    norm_w = normalize_weights(weights, common_routes)
    log_ratio = 0.0
    for r in common_routes:
        log_ratio += norm_w[r] * math.log(prices_t[r] / prices_0[r])
    return log_ratio


def compute_geks_tornqvist_index(
    daily_route_prices: Dict[dt.date, Dict[str, float]],
    base_date: Optional[dt.date] = None,
    weights: Optional[Dict[str, float]] = None,
    base_value: float = 100.0
) -> Dict[dt.date, float]:
    """
    Compute multilateral GEKS-Törnqvist price index across all dates.
    GEKS formulation:
    ln(P_GEKS(0, t)) = (1 / |T|) * sum_{k in T} [ ln(P_T(0, k)) - ln(P_T(t, k)) ]
    
    Guarantees:
    - Transitivity: P(r, s) * P(s, t) = P(r, t)
    - Base-period invariance (no chain drift)
    - Identity: P(t, t) = base_value
    """
    if not daily_route_prices:
        return {}

    sorted_dates = sorted(daily_route_prices.keys())
    base_date = base_date or sorted_dates[0]
    weights = weights or DGCA_ROUTE_WEIGHTS

    all_dates = sorted_dates
    num_periods = len(all_dates)

    # Step 1: Compute matrix of all bilateral log ratios: M[j, k] = ln(P_T(j, k))
    log_matrix: Dict[Tuple[dt.date, dt.date], float] = {}
    for d1 in all_dates:
        for d2 in all_dates:
            if d1 == d2:
                log_matrix[(d1, d2)] = 0.0
            else:
                log_matrix[(d1, d2)] = compute_tornqvist_log_ratio(
                    daily_route_prices[d1],
                    daily_route_prices[d2],
                    weights
                )

    # Step 2: GEKS formula for each date t relative to base_date
    results: Dict[dt.date, float] = {}
    for t in all_dates:
        sum_terms = 0.0
        for k in all_dates:
            # ln(P_T(0, k)) - ln(P_T(t, k))
            sum_terms += log_matrix[(base_date, k)] - log_matrix[(t, k)]
            
        mean_log = sum_terms / float(num_periods)
        index_val = round(base_value * math.exp(mean_log), 2)
        results[t] = index_val

    return results


def aggregate_to_weekly(daily_indices: Dict[dt.date, float]) -> Dict[str, float]:
    """Aggregate daily index series into ISO weekly series via geometric mean."""
    weeks: Dict[str, List[float]] = {}
    for d, val in daily_indices.items():
        year, week_num, _ = d.isocalendar()
        key = f"{year}-W{week_num:02d}"
        weeks.setdefault(key, []).append(val)

    weekly_indices = {}
    for wk, vals in sorted(weeks.items()):
        # Geometric mean
        log_mean = sum(math.log(v) for v in vals) / len(vals)
        weekly_indices[wk] = round(math.exp(log_mean), 2)
    return weekly_indices


def aggregate_to_monthly(daily_indices: Dict[dt.date, float]) -> Dict[str, float]:
    """Aggregate daily index series into monthly series via geometric mean."""
    months: Dict[str, List[float]] = {}
    for d, val in daily_indices.items():
        key = d.strftime("%Y-%m")
        months.setdefault(key, []).append(val)

    monthly_indices = {}
    for m, vals in sorted(months.items()):
        log_mean = sum(math.log(v) for v in vals) / len(vals)
        monthly_indices[m] = round(math.exp(log_mean), 2)
    return monthly_indices


def calculate_and_save_daily_indices(
    session: Session,
    base_date: Optional[dt.date] = None
) -> List[IndexDaily]:
    """
    Extract all quotes from DB, calculate multilateral GEKS-Törnqvist indices,
    and persist results to index_daily and index_route tables.
    """
    quotes = session.exec(select(FareQuote)).all()
    if not quotes:
        logger.warning("No fare quotes found in DB to compute index.")
        return []

    # Build DataFrame
    records = []
    for q in quotes:
        records.append({
            "date": q.departure_date,
            "route": q.route,
            "total_fare": q.total_fare,
            "base_fare": q.base_fare,
            "source_type": q.source_type
        })
    df = pd.DataFrame(records)

    # Group by date and route -> median fare
    grouped = df.groupby(["date", "route"])["total_fare"].median().unstack(level="route")
    
    # Check seeded flags per date
    seeded_flags = df.groupby("date")["source_type"].apply(lambda s: (s == "seeded").any()).to_dict()
    sample_sizes = df.groupby("date")["total_fare"].count().to_dict()

    daily_route_prices: Dict[dt.date, Dict[str, float]] = {}
    for d, row in grouped.iterrows():
        prices = row.dropna().to_dict()
        if prices:
            daily_route_prices[d] = prices

    if not daily_route_prices:
        return []

    sorted_dates = sorted(daily_route_prices.keys())
    base_d = base_date or sorted_dates[0]

    # 1. Compute overall GEKS-Törnqvist daily series
    daily_idx_map = compute_geks_tornqvist_index(daily_route_prices, base_date=base_d)

    saved_records: List[IndexDaily] = []
    for d, val in daily_idx_map.items():
        # Check if already exists, update or create
        existing = session.exec(select(IndexDaily).where(IndexDaily.date == d)).first()
        if existing:
            existing.index_value = val
            existing.sample_size = sample_sizes.get(d, 0)
            existing.has_seeded_data = seeded_flags.get(d, False)
            existing.computed_at = dt.datetime.now(dt.timezone.utc)
            session.add(existing)
            saved_records.append(existing)
        else:
            new_idx = IndexDaily(
                date=d,
                index_value=val,
                base_period=base_d,
                method="GEKS-Törnqvist",
                sample_size=sample_sizes.get(d, 0),
                has_seeded_data=seeded_flags.get(d, False),
                computed_at=dt.datetime.now(dt.timezone.utc)
            )
            session.add(new_idx)
            saved_records.append(new_idx)

    # 2. Compute route-level indices
    route_medians = df.groupby(["route", "date"])["total_fare"].median()
    base_route_medians = df[df["date"] == base_d].groupby("route")["total_fare"].median().to_dict()
    
    for (r, d), median_fare in route_medians.items():
        base_f = base_route_medians.get(r, median_fare)
        route_val = round(100.0 * (median_fare / base_f), 2) if base_f > 0 else 100.0
        
        existing_route = session.exec(
            select(IndexRoute).where(IndexRoute.date == d, IndexRoute.route == r)
        ).first()
        
        sample_s = len(df[(df["date"] == d) & (df["route"] == r)])
        has_seeded = (df[(df["date"] == d) & (df["route"] == r)]["source_type"] == "seeded").any()
        
        if existing_route:
            existing_route.index_value = route_val
            existing_route.avg_total_fare = round(median_fare, 2)
            existing_route.sample_size = sample_s
            existing_route.has_seeded_data = bool(has_seeded)
            session.add(existing_route)
        else:
            new_r_idx = IndexRoute(
                date=d,
                route=r,
                index_value=route_val,
                avg_total_fare=round(median_fare, 2),
                sample_size=sample_s,
                has_seeded_data=bool(has_seeded)
            )
            session.add(new_r_idx)

    # Emit index recomputed event
    event_bus.publish(PipelineEvent(
        event_type=EventType.INDEX_RECOMPUTED,
        message=f"INDEX RECOMPUTED :: {len(saved_records)} DAILY POINTS",
        data={"points": len(saved_records), "latest_value": saved_records[-1].index_value if saved_records else None}
    ))

    # Surge detection: check if any route's latest median exceeds its historical baseline by >= 20%
    for r in route_medians.index.get_level_values("route").unique():
        route_prices = route_medians[r].sort_index()
        if len(route_prices) < 2:
            continue
        current_val = float(route_prices.iloc[-1])
        baseline_vals = route_prices.iloc[:-1]
        baseline_avg = float(baseline_vals.mean()) if len(baseline_vals) > 0 else current_val
        if baseline_avg > 0:
            pct_above = ((current_val - baseline_avg) / baseline_avg) * 100
            if pct_above >= 20:
                event_bus.publish(PipelineEvent(
                    event_type=EventType.SURGE_DETECTED,
                    message=f"\u25b2 SURGE :: {r} \u2014 {pct_above:.0f}% ABOVE BASELINE",
                    route=r,
                    data={"current": round(current_val, 2), "baseline": round(baseline_avg, 2), "pct_above": round(pct_above, 1)}
                ))

    session.commit()
    return saved_records
