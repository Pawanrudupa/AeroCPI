"""
AeroCPI Backtest vs DGCA Engine.
Implements:
- ARCHITECTURE.md Section 3 (Backtest vs DGCA)
- FEATURES.md (DGCA backtest comparison metrics)
"""
import logging
import math
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd
from sqlmodel import Session, select
from backend.app.models import IndexDaily, MospiBenchmark

logger = logging.getLogger("aerocpi.dgca.backtest")


def compute_backtest_metrics(session: Session) -> Dict[str, Any]:
    """
    Compare AeroCPI headline aggregate index against official MoSPI Division 07.3 CPI.
    Note: MoSPI benchmark is an all-India aggregate covering passenger transport services, not just airfare.
    """
    daily_records = session.exec(select(IndexDaily).order_by(IndexDaily.date)).all()
    mospi_records = session.exec(select(MospiBenchmark).where(MospiBenchmark.sector == "Combined").order_by(MospiBenchmark.month)).all()

    if not mospi_records:
        return {
            "status": "no_benchmark_data",
            "message": "No verified MoSPI benchmark data available. Awaiting MoSPI CPI release overlap.",
            "series": [],
            "correlation": None,
            "tracking_error": None
        }

    # Map MoSPI data by month
    mospi_by_month: Dict[str, float] = {}
    mospi_provenance: Dict[str, Dict[str, Any]] = {}
    for rec in mospi_records:
        month = rec.month
        mospi_by_month[month] = rec.cpi_index
        mospi_provenance[month] = {
            "source_document": rec.source_document,
            "publication_date": rec.publication_date,
            "source_url": rec.source_url,
            "scope_limitation": "All-India aggregate CPI Div 07.3: Passenger transport services (not airfare-only)"
        }

    # If daily records exist, aggregate by month
    aerocpi_monthly: Dict[str, float] = {}
    if daily_records:
        df_daily = pd.DataFrame([{"date": r.date, "val": r.index_value} for r in daily_records])
        df_daily["month"] = df_daily["date"].apply(lambda d: d.strftime("%Y-%m"))
        monthly_grouped = df_daily.groupby("month")["val"].mean()
        aerocpi_monthly = monthly_grouped.to_dict()

    # Build comparative time series
    series = []
    aerocpi_vals = []
    mospi_vals = []

    all_months = sorted(set(mospi_by_month.keys()).union(aerocpi_monthly.keys()))
    
    # Normalize MoSPI to our base period if needed, but since we just want tracking, we can compare directly 
    # or normalize MoSPI to 100 on the first overlap month. Let's rebase MoSPI to 100 for visual comparison.
    base_month = all_months[0] if all_months else None
    base_mospi_idx = mospi_by_month.get(base_month, 100.0) if base_month else 100.0

    for m in all_months:
        aero_val = aerocpi_monthly.get(m)
        raw_mospi_idx = mospi_by_month.get(m)
        norm_mospi_idx = round((raw_mospi_idx / base_mospi_idx) * 100.0, 2) if raw_mospi_idx and base_mospi_idx > 0 else None
        
        divergence = None
        if aero_val is not None and norm_mospi_idx is not None:
            divergence = round(aero_val - norm_mospi_idx, 2)
            aerocpi_vals.append(aero_val)
            mospi_vals.append(norm_mospi_idx)

        series.append({
            "month": m,
            "aerocpi_index": aero_val,
            "mospi_index": norm_mospi_idx,
            "mospi_raw_cpi": raw_mospi_idx,
            "divergence": divergence,
            "provenance": mospi_provenance.get(m)
        })

    # Statistical metrics
    correlation = None
    tracking_error = None
    if len(aerocpi_vals) >= 2 and len(mospi_vals) >= 2:
        try:
            arr_aero = np.array(aerocpi_vals)
            arr_mospi = np.array(mospi_vals)
            r = np.corrcoef(arr_aero, arr_mospi)[0, 1]
            correlation = round(float(r), 4) if not math.isnan(r) else None
            
            # Root Mean Square Tracking Error
            rmse = np.sqrt(np.mean((arr_aero - arr_mospi) ** 2))
            tracking_error = round(float(rmse), 2)
        except Exception as e:
            logger.error(f"Error computing correlation: {e}")

    return {
        "status": "success",
        "months_compared": len(series),
        "overlapping_points": len(aerocpi_vals),
        "correlation": correlation,
        "tracking_error": tracking_error,
        "benchmark_type": "OFFICIAL_GOVERNMENT_AGGREGATE",
        "benchmark_source": "MoSPI CPI Div 07.3 Passenger transport services (Base 2024=100, Ref: PRID 2220040/2054203)",
        "series": series
    }
