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
    # 2 overlapping points: correlation suppressed (2-point r is always +/-1.000)
    assert backtest["correlation"] is None
    # RMSE is still meaningful with 2 points
    assert backtest["tracking_error"] is not None
    assert backtest["overlap_detected"] is True
    assert backtest["overlapping_points"] == 2
    assert "2 calendar overlap point(s)" in backtest["overlap_message"]
    assert "r requires >= 3 months" in backtest["overlap_message"]

def test_backtest_overlap_detection(session: Session):
    from backend.app.models import MospiBenchmark
    d1 = dt.date(2026, 9, 15)
    session.add(IndexDaily(date=d1, index_value=105.0, base_period=d1, method="GEKS-Törnqvist"))
    
    # Insert 1 MoSPI point
    session.add(MospiBenchmark(
        month="2026-09",
        cpi_index=110.0,
        sector="Combined",
        source_document="MoSPI",
        publication_date="2026-10-12",
        source_url="http://pib.gov.in"
    ))
    session.commit()
    
    bt1 = compute_backtest_metrics(session)
    assert bt1["overlap_detected"] is True
    assert bt1["overlapping_points"] == 1
    assert "1 calendar overlap point(s)" in bt1["overlap_message"]
    assert "r requires >= 3 months" in bt1["overlap_message"]
    assert bt1["correlation"] is None
    
    # Insert non-overlapping MoSPI point
    session.add(MospiBenchmark(
        month="2026-01",
        cpi_index=100.0,
        sector="Combined",
        source_document="MoSPI",
        publication_date="2026-02-12",
        source_url="http://pib.gov.in"
    ))
    session.commit()
    
    bt2 = compute_backtest_metrics(session)
    # The overlapping points remain 1, but we have 2 mospi points
    assert bt2["overlapping_points"] == 1
    
    # Add a second overlapping point (index for 2026-01)
    d2 = dt.date(2026, 1, 15)
    session.add(IndexDaily(date=d2, index_value=100.0, base_period=d2, method="GEKS-Törnqvist"))
    session.commit()
    
    bt3 = compute_backtest_metrics(session)
    assert bt3["overlapping_points"] == 2
    # 2 points: still no correlation (r with 2 points is always +/-1.000)
    assert bt3["correlation"] is None
    assert bt3["tracking_error"] is not None  # RMSE is valid with 2 points
    assert "2 calendar overlap point(s)" in bt3["overlap_message"]
    assert "r requires >= 3 months" in bt3["overlap_message"]
    
    # Add a THIRD overlapping point — correlation should now be computed
    d3 = dt.date(2026, 3, 15)
    session.add(IndexDaily(date=d3, index_value=102.5, base_period=d2, method="GEKS-Törnqvist"))
    session.add(MospiBenchmark(
        month="2026-03",
        cpi_index=101.0,
        sector="Combined",
        source_document="MoSPI",
        publication_date="2026-04-12",
        source_url="http://pib.gov.in"
    ))
    session.commit()
    
    bt4 = compute_backtest_metrics(session)
    assert bt4["overlapping_points"] == 3
    assert bt4["correlation"] is not None
    assert bt4["tracking_error"] is not None
    assert "MoSPI calendar overlap active (3 months)" in bt4["overlap_message"]
    assert "Pearson r =" in bt4["overlap_message"]
