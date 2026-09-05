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
from backend.app.models import IndexDaily, DGCABenchmark

logger = logging.getLogger("aerocpi.dgca.backtest")


def compute_backtest_metrics(session: Session) -> Dict[str, Any]:
    """
    Compare AeroCPI index against verified DGCA monthly benchmark data.
    Computes Pearson r, tracking error, and comparative time-series for dashboard charting.
    """
    daily_records = session.exec(select(IndexDaily).order_by(IndexDaily.date)).all()
    dgca_records = session.exec(select(DGCABenchmark).order_by(DGCABenchmark.month)).all()

    if not dgca_records:
        return {
            "status": "no_dgca_data",
            "message": "No verified DGCA benchmark data available. Ingest official DGCA reports to compute backtest.",
            "series": [],
            "correlation": None,
            "tracking_error": None
        }

    # Map DGCA data by month
    dgca_by_month: Dict[str, float] = {}
    dgca_provenance: Dict[str, Dict[str, Any]] = {}
    for rec in dgca_records:
        # Weighted average across routes for the month
        month = rec.month
        dgca_by_month.setdefault(month, []).append(rec.avg_fare * rec.passenger_share)
        dgca_provenance[month] = {
            "source_document": rec.source_document,
            "publication_date": rec.publication_date,
            "source_url": rec.source_url
        }

    monthly_dgca_averages: Dict[str, float] = {}
    for m, weighted_fares in dgca_by_month.items():
        monthly_dgca_averages[m] = round(sum(weighted_fares), 2)

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
    dgca_vals = []

    all_months = sorted(set(monthly_dgca_averages.keys()).union(aerocpi_monthly.keys()))
    
    # Normalize DGCA fares to base 100 for side-by-side index comparison
    base_month = all_months[0] if all_months else None
    base_dgca_fare = monthly_dgca_averages.get(base_month, 1.0) if base_month else 1.0

    for m in all_months:
        aero_val = aerocpi_monthly.get(m)
        raw_dgca_fare = monthly_dgca_averages.get(m)
        norm_dgca_idx = round((raw_dgca_fare / base_dgca_fare) * 100.0, 2) if raw_dgca_fare and base_dgca_fare > 0 else None
        
        divergence = None
        if aero_val is not None and norm_dgca_idx is not None:
            divergence = round(aero_val - norm_dgca_idx, 2)
            aerocpi_vals.append(aero_val)
            dgca_vals.append(norm_dgca_idx)

        series.append({
            "month": m,
            "aerocpi_index": aero_val,
            "dgca_index": norm_dgca_idx,
            "dgca_raw_fare": raw_dgca_fare,
            "divergence": divergence,
            "provenance": dgca_provenance.get(m)
        })

    # Statistical metrics
    correlation = None
    tracking_error = None
    if len(aerocpi_vals) >= 2 and len(dgca_vals) >= 2:
        try:
            arr_aero = np.array(aerocpi_vals)
            arr_dgca = np.array(dgca_vals)
            r = np.corrcoef(arr_aero, arr_dgca)[0, 1]
            correlation = round(float(r), 4) if not math.isnan(r) else None
            
            # Root Mean Square Tracking Error
            rmse = np.sqrt(np.mean((arr_aero - arr_dgca) ** 2))
            tracking_error = round(float(rmse), 2)
        except Exception as e:
            logger.error(f"Error computing correlation: {e}")

    return {
        "status": "success",
        "months_compared": len(series),
        "overlapping_points": len(aerocpi_vals),
        "correlation": correlation,
        "tracking_error": tracking_error,
        "benchmark_type": "OFFICIAL_GOVERNMENT",
        "series": series
    }
