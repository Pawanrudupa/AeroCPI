"""
AeroCPI MoSPI Benchmark Data Ingestion & Provenance Engine.
Implements:
- METHODOLOGY.md Section: MoSPI CPI Benchmark (Division 07.3: Passenger transport services)
- Strict provenance requirements: source_document, publication_date, source_url
- Upsert logic for monthly government releases
"""
import csv
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from backend.app.models import MospiBenchmark

logger = logging.getLogger("aerocpi.mospi.ingestion")

MONTH_REGEX = re.compile(r"^\d{4}-\d{2}$")


def ingest_mospi_csv(session: Session, file_path: str) -> List[MospiBenchmark]:
    """
    Ingests a verified MoSPI Consumer Price Index (CPI) Division 07.3 dataset from CSV.
    Enforces strict provenance validation to ensure zero unvetted figures enter the benchmark index.

    Expected CSV columns:
    month, cpi_index, [sector], [benchmark_type], source_document, publication_date, source_url
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"MoSPI benchmark data file not found: {file_path}")

    ingested: List[MospiBenchmark] = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_num, row in enumerate(reader, start=2):
            month = (row.get("month") or "").strip()
            cpi_str = (row.get("cpi_index") or "").strip()
            sector = (row.get("sector") or "Combined").strip()
            b_type = (row.get("benchmark_type") or "OFFICIAL_GOVERNMENT").strip()
            src_doc = (row.get("source_document") or "").strip()
            pub_date = (row.get("publication_date") or "").strip()
            src_url = (row.get("source_url") or "").strip()

            # 1. Format validation
            if not month or not MONTH_REGEX.match(month):
                logger.warning(f"Row {row_num}: Skipping invalid month format '{month}'. Expected YYYY-MM.")
                continue

            if not cpi_str:
                logger.warning(f"Row {row_num}: Skipping empty cpi_index for month {month}.")
                continue

            try:
                cpi_index = float(cpi_str)
                if cpi_index <= 0:
                    raise ValueError(f"cpi_index must be positive, got {cpi_index}")
            except ValueError as e:
                logger.error(f"Row {row_num}: Invalid numeric cpi_index: {e}")
                continue

            # 2. Strict provenance validation
            if not src_doc:
                raise ValueError(
                    f"Provenance validation error at row {row_num} ({month}): "
                    "source_document is required to maintain institutional integrity."
                )
            if not pub_date:
                raise ValueError(
                    f"Provenance validation error at row {row_num} ({month}): "
                    "publication_date is required to maintain institutional integrity."
                )
            if not src_url:
                raise ValueError(
                    f"Provenance validation error at row {row_num} ({month}): "
                    "source_url is required to maintain institutional integrity."
                )

            # 3. Upsert logic
            existing = session.exec(
                select(MospiBenchmark).where(
                    MospiBenchmark.month == month,
                    MospiBenchmark.sector == sector
                )
            ).first()

            if existing:
                existing.cpi_index = cpi_index
                existing.source_document = src_doc
                existing.publication_date = pub_date
                existing.source_url = src_url
                existing.benchmark_type = b_type
                session.add(existing)
                ingested.append(existing)
            else:
                benchmark = MospiBenchmark(
                    month=month,
                    cpi_index=cpi_index,
                    sector=sector,
                    benchmark_type=b_type,
                    source_document=src_doc,
                    publication_date=pub_date,
                    source_url=src_url,
                )
                session.add(benchmark)
                ingested.append(benchmark)

    session.commit()
    logger.info(f"Successfully ingested/updated {len(ingested)} verified MoSPI benchmark records from {file_path}")
    return ingested
