import pytest
import datetime as dt
from fastapi.testclient import TestClient
from sqlmodel import create_engine, Session, select
from sqlalchemy.pool import StaticPool
from backend.app.main import app
from backend.app.database import get_session, create_db_and_tables
from backend.app.models import User, FareQuote, IndexDaily, IndexRoute, MospiBenchmark
from backend.app.security import hash_password, create_access_token
from backend.app.etl.cleaner import clean_and_normalize_quotes
from backend.app.index.geks import calculate_and_save_daily_indices

client = TestClient(app)

@pytest.fixture(name="test_session")
def test_session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    create_db_and_tables(engine)
    with Session(engine) as session:
        user = User(
            email="analyst@aerocpi.local",
            hashed_password=hash_password("TestPass123!"),
            role="analyst"
        )
        session.add(user)
        session.commit()
    def override_get_session():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_session] = override_get_session
    yield engine
    app.dependency_overrides.clear()

def test_fare_class_cleaner_and_breakdown(test_session):
    engine = test_session
    with Session(engine) as session:
        raw = [
            {"carrier": "IndiGo", "flight_no": "6E-101", "total_fare": 5500.0, "fare_class": "economy"},
            {"carrier": "Air India", "flight_no": "AI-202", "total_fare": 16000.0, "fare_class": "business"},
            {"carrier": "SpiceJet", "flight_no": "SG-303", "total_fare": 6200.0}
        ]
        cleaned = clean_and_normalize_quotes(raw, "DEL-BOM", "T+7", dt.date(2026, 9, 25), "indigo", source_type="live")
        assert len(cleaned) == 3
        classes = {q.flight_number: q.fare_class for q in cleaned}
        assert classes["6E-101"] == "economy"
        assert classes["AI-202"] == "business"
        assert classes["SG-303"] == "economy"
        for q in cleaned:
            session.add(q)
        session.commit()
    token = create_access_token({"sub": "analyst@aerocpi.local", "role": "analyst"})
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/reports/fare-class-breakdown", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "breakdown" in data
    assert "class_summary" in data
    assert "economy" in data["class_summary"]
    assert "business" in data["class_summary"]
    assert data["class_summary"]["economy"]["count"] == 2
    assert data["class_summary"]["business"]["count"] == 1

def test_sold_out_and_unavailable_handling(test_session):
    engine = test_session
    dep_date = dt.date(2026, 9, 25)
    obs_date = dt.datetime(2026, 9, 18, 12, 0, 0, tzinfo=dt.timezone.utc)
    raw_mixed = [
        {"carrier": "IndiGo", "flight_no": "6E-100", "total_fare": 0.0},
        {"carrier": "IndiGo", "flight_no": "6E-101", "total_fare": 5000.0, "status": "sold_out"},
        {"carrier": "SpiceJet", "flight_no": "SG-200", "total_fare": 0.0, "status": "unavailable"},
        {"carrier": "Akasa Air", "flight_no": "QP-300", "total_fare": 5200.0}
    ]
    cleaned = clean_and_normalize_quotes(raw_mixed, "DEL-BOM", "T+7", dep_date, "indigo")
    assert len(cleaned) == 4
    statuses = {q.flight_number: q.observation_status for q in cleaned}
    assert statuses["6E-100"] == "sold_out"
    assert statuses["6E-101"] == "sold_out"
    assert statuses["SG-200"] == "unavailable"
    assert statuses["QP-300"] == "available"
    # Set scraped_at so observation-date bucketing groups correctly
    for q in cleaned:
        q.scraped_at = obs_date
    with Session(engine) as session:
        for q in cleaned:
            session.add(q)
        session.commit()
        daily_records = calculate_and_save_daily_indices(session, base_date=obs_date.date())
        assert len(daily_records) >= 1
        route_rec = session.exec(select(IndexRoute).where(IndexRoute.route == "DEL-BOM")).first()
        assert route_rec is not None
        assert route_rec.avg_total_fare == 5200.0
    token = create_access_token({"sub": "analyst@aerocpi.local", "role": "analyst"})
    headers = {"Authorization": f"Bearer {token}"}
    cov_res = client.get("/reports/coverage-matrix", headers=headers)
    assert cov_res.status_code == 200
    cov_data = cov_res.json()
    assert cov_data["total_sold_out"] == 2
    assert cov_data["total_unavailable"] == 1

def test_weekly_and_monthly_index_aggregation(test_session):
    engine = test_session
    with Session(engine) as session:
        dates_and_values = [
            (dt.date(2026, 9, 7), 100.0),
            (dt.date(2026, 9, 8), 102.0),
            (dt.date(2026, 9, 14), 105.0),
            (dt.date(2026, 10, 1), 110.0),
        ]
        for d, val in dates_and_values:
            session.add(IndexDaily(
                date=d,
                index_value=val,
                base_period=dt.date(2026, 9, 7),
                sample_size=10
            ))
        session.add(MospiBenchmark(
            month="2026-09",
            cpi_index=103.5,
            sector="Combined",
            source_document="Test MoSPI Press Release",
            publication_date="2026-10-12",
            source_url="https://mospi.gov.in"
        ))
        session.commit()
    token = create_access_token({"sub": "analyst@aerocpi.local", "role": "analyst"})
    headers = {"Authorization": f"Bearer {token}"}
    w_res = client.get("/index/weekly", headers=headers)
    assert w_res.status_code == 200
    w_data = w_res.json()
    assert w_data["frequency"] == "weekly"
    periods = [p["period"] for p in w_data["data"]]
    assert "2026-W37" in periods
    assert "2026-W38" in periods
    assert "2026-W40" in periods
    m_res = client.get("/index/monthly", headers=headers)
    assert m_res.status_code == 200
    m_data = m_res.json()
    assert m_data["frequency"] == "monthly"
    months = {p["period"]: p for p in m_data["data"]}
    assert "2026-09" in months
    assert "2026-10" in months
    assert months["2026-09"]["mospi_cpi"] == 103.5
