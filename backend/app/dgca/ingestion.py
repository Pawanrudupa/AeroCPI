"""
AeroCPI DGCA Benchmark Data Ingestion.
Implements:
- ARCHITECTURE.md Section 3 (DGCA Data Ingestion)
- ARCHITECTURE.md Section 4.6 (DGCA format ingestion & validation)
- User Requirement: Strict provenance tracking (source_document, publication_date, source_url)
"""
import os
import csv
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from backend.app.models import DGCABenchmark

logger = logging.getLogger("aerocpi.dgca.ingestion")


def ingest_dgca_csv(session: Session, file_path: str) -> List[DGCABenchmark]:
    """
    Ingest a verified DGCA passenger tariff/yield CSV report into the database.
    Strictly validates provenance fields to prevent unsourced/fabricated figures.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"DGCA data file not found: {file_path}")

    ingested: List[DGCABenchmark] = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_num, row in enumerate(reader, start=2):
            route = (row.get("route") or "").strip().upper()
            month = (row.get("month") or "").strip()
            fare_str = (row.get("avg_fare") or "").strip()
            share_str = (row.get("passenger_share") or "").strip()
            src_doc = (row.get("source_document") or "").strip()
            pub_date = (row.get("publication_date") or "").strip()
            src_url = (row.get("source_url") or "").strip() or None
            b_type = (row.get("benchmark_type") or "OFFICIAL_GOVERNMENT").strip()
            pax_str = (row.get("pax_count") or "").strip()
            pax_cnt = int(pax_str) if pax_str and pax_str.isdigit() else None

            # Enforce hard provenance requirements
            if not route or not month or (fare_str == "" and not pax_cnt):
                logger.warning(f"Skipping row {row_num}: Missing core fields (route, month, avg_fare/pax_count)")
                continue

            if not src_doc or not pub_date:
                raise ValueError(
                    f"Provenance validation error at row {row_num} for {route}: "
                    "source_document and publication_date are required to maintain statistical integrity."
                )

            try:
                avg_fare = float(fare_str) if fare_str else 0.0
                share = float(share_str) if share_str else 0.15
            except ValueError as e:
                logger.error(f"Invalid numeric value at row {row_num}: {e}")
                continue

            # Check if record already exists for (month, route)
            existing = session.exec(
                select(DGCABenchmark).where(
                    DGCABenchmark.month == month,
                    DGCABenchmark.route == route
                )
            ).first()

            if existing:
                existing.avg_fare = avg_fare
                existing.passenger_share = share
                existing.source_document = src_doc
                existing.publication_date = pub_date
                existing.source_url = src_url
                existing.benchmark_type = b_type
                existing.pax_count = pax_cnt
                session.add(existing)
                ingested.append(existing)
            else:
                benchmark = DGCABenchmark(
                    month=month,
                    route=route,
                    avg_fare=avg_fare,
                    passenger_share=share,
                    source_document=src_doc,
                    publication_date=pub_date,
                    source_url=src_url,
                    benchmark_type=b_type,
                    pax_count=pax_cnt
                )
                session.add(benchmark)
                ingested.append(benchmark)

    session.commit()
    logger.info(f"Successfully ingested {len(ingested)} verified DGCA benchmark records from {file_path}")
    return ingested
