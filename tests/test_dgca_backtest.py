"""
DGCA Benchmark Ingestion and Backtest Unit Tests.
Implements:
- ARCHITECTURE.md Section 5 (Step 5 verification)
- FEATURES.md (DGCA backtest comparison)
"""
import os
import tempfile
import datetime as dt
import pytest
from sqlmodel import create_engine, Session, select
from backend.app.models import DGCABenchmark, IndexDaily
from backend.app.database import create_db_and_tables
from backend.app.dgca.ingestion import ingest_dgca_csv
from backend.app.dgca.backtest import compute_backtest_metrics


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine("sqlite:///:memory:", echo=False)
    create_db_and_tables(engine)
    with Session(engine) as session:
        yield session


def test_dgca_provenance_validation(session: Session):
    """Verify that rows missing provenance fields fail with ValueError."""
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as f:
        f.write("route,month,avg_fare,passenger_share,source_document,publication_date,source_url\n")
        f.write("DEL-BOM,2026-08,5500.0,0.24,,,https://example.com\n")
        temp_path = f.name

    try:
        with pytest.raises(ValueError, match="source_document and publication_date are required"):
            ingest_dgca_csv(session, temp_path)
    finally:
        os.remove(temp_path)


def test_dgca_ingestion_and_backtest(session: Session):
    """Verify ingestion of verified DGCA file and backtest metrics calculation."""
    csv_file = "data/dgca/verified_dgca_reports.csv"
    ingested = ingest_dgca_csv(session, csv_file)
    assert len(ingested) >= 12

    # Add sample IndexDaily points matching MoSPI benchmark months
    from backend.app.models import MospiBenchmark
    d1 = dt.date(2026, 1, 15)
    d2 = dt.date(2026, 2, 15)
    session.add(IndexDaily(date=d1, index_value=100.0, base_period=d1, method="GEKS-Törnqvist"))
    session.add(IndexDaily(date=d2, index_value=101.4, base_period=d1, method="GEKS-Törnqvist"))
    session.add(MospiBenchmark(
        month="2026-01",
        cpi_index=103.50,
        sector="Combined",
        source_document="MoSPI CPI Press Release",
        publication_date="2026-02-12",
        source_url="https://pib.gov.in"
    ))
    session.add(MospiBenchmark(
        month="2026-02",
        cpi_index=104.20,
        sector="Combined",
        source_document="MoSPI CPI Press Release",
        publication_date="2026-03-12",
        source_url="https://pib.gov.in"
    ))
    session.commit()

    backtest = compute_backtest_metrics(session)
    assert backtest["status"] == "success"
    assert len(backtest["series"]) >= 2
    assert backtest["correlation"] is not None
