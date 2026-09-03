"""
FastAPI Backend Integration & Security Tests.
Implements:
- ARCHITECTURE.md Section 2 (FastAPI & PyJWT auth)
- FEATURES.md (REST API endpoints and JWT gating)
- User Requirement: demo.analyst@aerocpi.local and SEED_ANALYST_PASSWORD
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine, Session
from backend.app.main import app
from backend.app.database import get_session, create_db_and_tables, init_seed_user
from backend.app.models import User, IndexDaily, FareQuote
from backend.app.security import hash_password
from sqlalchemy.pool import StaticPool
from backend.app.config import settings

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
        # Create test analyst user
        test_user = User(
            email="demo.analyst@aerocpi.local",
            hashed_password=hash_password("TestAnalystSecret#2026!"),
            role="analyst"
        )
        session.add(test_user)
        session.commit()
        
    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    yield engine
    app.dependency_overrides.clear()


def test_public_health_endpoint():
    """Verify /health is public and requires no authentication."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "AeroCPI API"
    assert data["index_method"] == "GEKS-Törnqvist"


def test_gated_endpoint_unauthorized_rejection():
    """Verify /index/daily and other data endpoints reject unauthenticated requests with 401."""
    response = client.get("/index/daily")
    assert response.status_code == 401

    response = client.get("/fares/raw")
    assert response.status_code == 401

    response = client.get("/backtest/dgca")
    assert response.status_code == 401


def test_auth_token_and_gated_flow(test_db):
    """Verify login and authenticated access to index and fare endpoints."""
    # 1. Login with JSON endpoint
    login_res = client.post(
        "/auth/login",
        json={
            "email": "demo.analyst@aerocpi.local",
            "password": "TestAnalystSecret#2026!"
        }
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    assert token_data["user_email"] == "demo.analyst@aerocpi.local"

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Access /index/daily with valid token
    index_res = client.get("/index/daily", headers=headers)
    assert index_res.status_code == 200
    assert index_res.json()["method"] == "GEKS-Törnqvist"

    # 3. Access /fares/raw with valid token
    fares_res = client.get("/fares/raw", headers=headers)
    assert fares_res.status_code == 200
    assert "quotes" in fares_res.json()

    # 4. Access /backtest/dgca with valid token
    dgca_res = client.get("/backtest/dgca", headers=headers)
    assert dgca_res.status_code == 200

    # 5. Invalid token returns 401
    bad_res = client.get("/index/daily", headers={"Authorization": "Bearer bad-token-here"})
    assert bad_res.status_code == 401
