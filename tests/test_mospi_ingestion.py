"""
Tests for MoSPI Benchmark Data Ingestion & Provenance Validation.
"""
import os
import tempfile
import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from backend.app.models import MospiBenchmark
from backend.app.mospi.ingestion import ingest_mospi_csv


@pytest.fixture
def memory_session():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_ingest_verified_mospi_cpi_csv(memory_session):
    csv_path = os.path.join("data", "mospi", "verified_mospi_cpi.csv")
    assert os.path.exists(csv_path), "Verified MoSPI CSV should exist in data/mospi/"

    ingested = ingest_mospi_csv(memory_session, csv_path)
    assert len(ingested) == 2, "Should ingest exactly 2 verified historical monthly MoSPI records"

    # Verify 2026-01 record
    rec_jan = memory_session.exec(
        select(MospiBenchmark).where(MospiBenchmark.month == "2026-01")
    ).first()
    assert rec_jan is not None
    assert rec_jan.cpi_index == 100.64
    assert rec_jan.benchmark_type == "OFFICIAL_GOVERNMENT"
    assert "MoSPI" in rec_jan.source_document
    assert rec_jan.publication_date == "2026-02-12"
    assert "https://" in rec_jan.source_url

    # Verify 2026-02 record
    rec_feb = memory_session.exec(
        select(MospiBenchmark).where(MospiBenchmark.month == "2026-02")
    ).first()
    assert rec_feb is not None
    assert rec_feb.cpi_index == 100.69
    assert rec_feb.benchmark_type == "OFFICIAL_GOVERNMENT"
    assert "MoSPI" in rec_feb.source_document
    assert rec_feb.publication_date == "2026-03-12"
    assert "https://" in rec_feb.source_url



def test_ingest_mospi_provenance_enforcement(memory_session):
    """Enforce that missing provenance fields raises ValueError."""
    # Missing source_document
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write("month,cpi_index,sector,source_document,publication_date,source_url\n")
        f.write("2026-05,107.50,Combined,,2026-06-12,https://mospi.gov.in\n")
        bad_csv = f.name

    try:
        with pytest.raises(ValueError, match="source_document is required"):
            ingest_mospi_csv(memory_session, bad_csv)
    finally:
        os.remove(bad_csv)

    # Missing source_url
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write("month,cpi_index,sector,source_document,publication_date,source_url\n")
        f.write("2026-05,107.50,Combined,MoSPI Report,2026-06-12,\n")
        bad_csv2 = f.name

    try:
        with pytest.raises(ValueError, match="source_url is required"):
            ingest_mospi_csv(memory_session, bad_csv2)
    finally:
        os.remove(bad_csv2)


def test_ingest_mospi_upsert_behavior(memory_session):
    """Verify that re-ingesting updates the existing record rather than creating duplicates."""
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write("month,cpi_index,sector,source_document,publication_date,source_url\n")
        f.write("2026-01,105.70,Combined,Initial Report,2026-02-12,https://mospi.gov.in\n")
        csv_file = f.name

    try:
        ingest_mospi_csv(memory_session, csv_file)
        count1 = len(memory_session.exec(select(MospiBenchmark)).all())
        assert count1 == 1

        # Re-ingest with updated CPI index
        with open(csv_file, "w") as f2:
            f2.write("month,cpi_index,sector,source_document,publication_date,source_url\n")
            f2.write("2026-01,105.95,Combined,Revised Report,2026-02-15,https://mospi.gov.in/revised\n")

        ingest_mospi_csv(memory_session, csv_file)
        all_recs = memory_session.exec(select(MospiBenchmark)).all()
        assert len(all_recs) == 1, "Upsert should not increase record count"
        assert all_recs[0].cpi_index == 105.95
        assert all_recs[0].source_document == "Revised Report"
    finally:
        os.remove(csv_file)
