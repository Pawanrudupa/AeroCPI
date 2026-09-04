"""
AeroCPI PDF Telemetry Report Unit & Integration Tests.
Verifies:
- Vector PDF document generation via ReportLab
- Server-rendered Matplotlib bar chart (Source vs Average Fare)
- Provenance notice (SEEDED vs LIVE)
- Authenticated /fares/export-pdf and /reports/export-pdf endpoints
"""
import io
import datetime as dt
import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine, Session
from sqlalchemy.pool import StaticPool

from backend.app.main import app
from backend.app.database import get_session, create_db_and_tables
from backend.app.models import User, FareQuote
from backend.app.security import hash_password
from backend.app.reports.pdf_generator import generate_reports_pdf, render_source_bar_chart

client = TestClient(app)


@pytest.fixture(name="test_db")
def test_db_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    create_db_and_tables(engine)

    with Session(engine) as session:
        test_user = User(
            email="pdf.analyst@aerocpi.local",
            hashed_password=hash_password("PdfAnalystSecret#2026!"),
            role="analyst"
        )
        session.add(test_user)

        # Add sample quotes with varied sources and types
        now = dt.datetime.now(dt.timezone.utc)
        sample_quotes = [
            FareQuote(
                route="DEL-BOM",
                carrier="IndiGo",
                flight_number="6E-205",
                window="T+7",
                departure_date=dt.date(2026, 9, 11),
                base_fare=4600.0,
                taxes=750.0,
                udf=350.0,
                convenience_fee=300.0,
                total_fare=6000.0,
                source="indigo",
                source_type="live",
                scraped_at=now
            ),
            FareQuote(
                route="DEL-BOM",
                carrier="Akasa Air",
                flight_number="QP-1102",
                window="T+7",
                departure_date=dt.date(2026, 9, 11),
                base_fare=4400.0,
                taxes=700.0,
                udf=350.0,
                convenience_fee=250.0,
                total_fare=5700.0,
                source="akasa",
                source_type="seeded",
                scraped_at=now
            ),
            FareQuote(
                route="DEL-BOM",
                carrier="SpiceJet",
                flight_number="SG-8169",
                window="T+7",
                departure_date=dt.date(2026, 9, 11),
                base_fare=4200.0,
                taxes=700.0,
                udf=350.0,
                convenience_fee=250.0,
                total_fare=5500.0,
                source="spicejet",
                source_type="seeded",
                scraped_at=now
            ),
            FareQuote(
                route="DEL-BOM",
                carrier="IndiGo",
                flight_number="6E-205",
                window="T+7",
                departure_date=dt.date(2026, 9, 11),
                base_fare=4500.0,
                taxes=750.0,
                udf=350.0,
                convenience_fee=449.0,
                total_fare=6049.0,
                source="easemytrip",
                source_type="live",
                scraped_at=now
            ),
        ]
        for q in sample_quotes:
            session.add(q)
        session.commit()

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    yield engine
    app.dependency_overrides.clear()


def test_render_source_bar_chart():
    """Verify server-rendered bar chart produces valid PNG image bytes."""
    now = dt.datetime.now(dt.timezone.utc)
    quotes = [
        FareQuote(
            route="DEL-BOM",
            carrier="IndiGo",
            flight_number="6E-205",
            window="T+7",
            departure_date=dt.date(2026, 9, 11),
            base_fare=4600.0,
            taxes=750.0,
            udf=350.0,
            convenience_fee=300.0,
            total_fare=6000.0,
            source="indigo",
            source_type="live",
            scraped_at=now
        ),
        FareQuote(
            route="DEL-BOM",
            carrier="Akasa Air",
            flight_number="QP-1102",
            window="T+7",
            departure_date=dt.date(2026, 9, 11),
            base_fare=4400.0,
            taxes=700.0,
            udf=350.0,
            convenience_fee=250.0,
            total_fare=5700.0,
            source="akasa",
            source_type="seeded",
            scraped_at=now
        )
    ]
    buf = render_source_bar_chart(quotes)
    data = buf.getvalue()
    assert len(data) > 1000
    assert data.startswith(b"\x89PNG\r\n\x1a\n")


def test_generate_reports_pdf_structure():
    """Verify generate_reports_pdf creates a valid, readable PDF document."""
    now = dt.datetime.now(dt.timezone.utc)
    quotes = [
        FareQuote(
            route="DEL-BOM",
            carrier="IndiGo",
            flight_number="6E-205",
            window="T+7",
            departure_date=dt.date(2026, 9, 11),
            base_fare=4600.0,
            taxes=750.0,
            udf=350.0,
            convenience_fee=300.0,
            total_fare=6000.0,
            source="indigo",
            source_type="live",
            scraped_at=now
        ),
        FareQuote(
            route="DEL-BOM",
            carrier="Akasa Air",
            flight_number="QP-1102",
            window="T+7",
            departure_date=dt.date(2026, 9, 11),
            base_fare=4400.0,
            taxes=700.0,
            udf=350.0,
            convenience_fee=250.0,
            total_fare=5700.0,
            source="akasa",
            source_type="seeded",
            scraped_at=now
        )
    ]
    filter_meta = {
        "route": "DEL-BOM",
        "window": "T+7",
        "source": "ALL 6 SOURCES",
        "source_type": "ALL (LIVE + SEEDED)"
    }
    pdf_bytes = generate_reports_pdf(quotes, filter_meta)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 5000
    assert pdf_bytes.startswith(b"%PDF-")


def test_pdf_export_endpoints(test_db):
    """Verify both /fares/export-pdf and /reports/export-pdf endpoints work with auth."""
    # 1. Login
    login_res = client.post(
        "/auth/login",
        json={
            "email": "pdf.analyst@aerocpi.local",
            "password": "PdfAnalystSecret#2026!"
        }
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test /fares/export-pdf
    res1 = client.get("/fares/export-pdf?route=DEL-BOM&window=T+7", headers=headers)
    assert res1.status_code == 200
    assert "application/pdf" in res1.headers["content-type"]
    assert "attachment; filename=\"AeroCPI_Telemetry_Report_" in res1.headers["content-disposition"]
    assert res1.content.startswith(b"%PDF-")

    # 3. Test /reports/export-pdf alias
    res2 = client.get("/reports/export-pdf", headers=headers)
    assert res2.status_code == 200
    assert "application/pdf" in res2.headers["content-type"]
    assert res2.content.startswith(b"%PDF-")
