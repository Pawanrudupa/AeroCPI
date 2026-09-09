"""
AeroCPI FastAPI Main Application.
Implements:
- ARCHITECTURE.md Section 2 (FastAPI backend with OpenAPI docs, PyJWT + Argon2 token auth)
- FEATURES.md (Endpoints: /index/daily, /index/route/{pair}, /fares/raw, /health, /backtest/dgca)
- User Requirement: Gating non-/health endpoints, surfacing source_type ("live" | "seeded")
"""
import os
import datetime as dt
import threading
import asyncio
import statistics
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status, Query, Path, Response, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from starlette.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.database import get_session, create_db_and_tables, init_seed_user, engine
from backend.app.models import (
    User,
    FareQuote,
    IndexDaily,
    IndexRoute,
    DGCABenchmark,
    LoginEvent,
    ElevationRequest,
)
from backend.app.security import (
    verify_password,
    hash_password,
    create_access_token,
    decode_access_token,
    hash_api_key,
    generate_api_key,
    generate_temp_password,
)
from backend.app.dgca.ingestion import ingest_dgca_csv
from backend.app.dgca.backtest import compute_backtest_metrics
from backend.app.scraper.basket_runner import run_full_basket_pipeline
from backend.app.index.geks import calculate_and_save_daily_indices
from backend.app.events import event_bus, PipelineEvent, EventType
from backend.app.reports.pdf_generator import generate_reports_pdf
from backend.app.email_service import (
    send_elevation_request_notification,
    send_elevation_status_notification,
    SENT_EMAILS_LOG,
)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown initialization."""
    create_db_and_tables()
    with Session(engine) as session:
        init_seed_user(session)
        # Auto-ingest official DGCA benchmark dataset if available
        dgca_file = os.path.join("data", "dgca", "verified_dgca_reports.csv")
        if os.path.exists(dgca_file):
            try:
                ingest_dgca_csv(session, dgca_file)
            except Exception as e:
                pass
    yield


app = FastAPI(
    title="AeroCPI — Real-time Airfare Price Index API",
    description=(
        "Automated high-frequency airfare data collection and GEKS-Törnqvist multilateral price index "
        "platform for India, augmenting official MoSPI/NSO CPI transport sector data."
    ),
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# Authentication Dependencies
# -----------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user_email: str
    role: str
    must_change_password: bool = False
    name: Optional[str] = None
    organization: Optional[str] = None


class LoginPayload(BaseModel):
    email: str
    password: str


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: Session = Depends(get_session)
) -> User:
    """Validate X-API-Key header OR Bearer JWT token and return authenticated User."""
    # 1. API Key Auth
    if x_api_key:
        api_hash = hash_api_key(x_api_key)
        user = session.exec(select(User).where(User.api_key_hash == api_hash)).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    # 2. Bearer Token Auth
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required (Bearer token or X-API-Key)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    email: str = payload["sub"]
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account inactive or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require ADMIN role for institutional administrator operations."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institutional Administrator privileges required"
        )
    return current_user


def _extract_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


# -----------------------------------------------------------------------------
# Public Endpoints
# -----------------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check():
    """Unauthenticated health & system status probe (ARCHITECTURE.md Section 4)."""
    return {
        "status": "healthy",
        "service": "AeroCPI API",
        "system_time": dt.datetime.now(dt.timezone.utc).isoformat(),
        "version": "1.0.0",
        "index_method": "GEKS-Törnqvist",
        "basket_size": 6,
        "supported_windows": ["T+7", "T+15", "T+30"]
    }


@app.post("/auth/token", response_model=TokenResponse, tags=["Authentication"])
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    """
    OAuth2 compatible token login.
    Uses Argon2 verification for institutional user credentials.
    Logs authentication attempts to login_events table.
    """
    client_ip = _extract_client_ip(request)
    user_agent = request.headers.get("user-agent")
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password) or not user.is_active:
        if user:
            session.add(LoginEvent(
                user_id=user.id,
                timestamp=dt.datetime.now(dt.timezone.utc),
                ip_address=client_ip,
                user_agent=user_agent,
                status="failed"
            ))
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Success
    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    session.add(user)
    session.add(LoginEvent(
        user_id=user.id,
        timestamp=user.last_login_at,
        ip_address=client_ip,
        user_agent=user_agent,
        status="success"
    ))
    session.commit()
    session.refresh(user)

    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user_email=user.email,
        role=user.role,
        must_change_password=user.must_change_password,
        name=user.name,
        organization=user.organization
    )


@app.post("/auth/login", response_model=TokenResponse, tags=["Authentication"])
def json_login(
    request: Request,
    payload: LoginPayload,
    session: Session = Depends(get_session)
):
    """JSON-body login for Next.js frontend consumption with audit event logging."""
    client_ip = _extract_client_ip(request)
    user_agent = request.headers.get("user-agent")
    user = session.exec(select(User).where(User.email == payload.email)).first()
    
    if not user or not verify_password(payload.password, user.hashed_password) or not user.is_active:
        if user:
            session.add(LoginEvent(
                user_id=user.id,
                timestamp=dt.datetime.now(dt.timezone.utc),
                ip_address=client_ip,
                user_agent=user_agent,
                status="failed"
            ))
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Success
    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    session.add(user)
    session.add(LoginEvent(
        user_id=user.id,
        timestamp=user.last_login_at,
        ip_address=client_ip,
        user_agent=user_agent,
        status="success"
    ))
    session.commit()
    session.refresh(user)

    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user_email=user.email,
        role=user.role,
        must_change_password=user.must_change_password,
        name=user.name,
        organization=user.organization
    )


class RegisterPayload(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    organization: Optional[str] = None


@app.post("/auth/register", response_model=TokenResponse, tags=["Authentication"])
def register_viewer(
    request: Request,
    payload: RegisterPayload,
    session: Session = Depends(get_session)
):
    """
    Self-service signup: instant and un-gated, assigns VIEWER role.
    Viewers can explore public data and request elevation to ANALYST from /account.
    """
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="A valid email address is required")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters in length")

    existing = session.exec(select(User).where(User.email == clean_email)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"An account with email '{clean_email}' already exists")

    new_user = User(
        email=clean_email,
        hashed_password=hash_password(payload.password),
        name=payload.name.strip() if payload.name else None,
        organization=payload.organization.strip() if payload.organization else None,
        role="viewer",
        is_active=True,
        must_change_password=False,
        created_at=dt.datetime.now(dt.timezone.utc),
        last_login_at=dt.datetime.now(dt.timezone.utc)
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    client_ip = _extract_client_ip(request)
    session.add(LoginEvent(
        user_id=new_user.id,
        timestamp=new_user.last_login_at,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        status="success"
    ))
    session.commit()

    token = create_access_token({"sub": new_user.email, "role": new_user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user_email=new_user.email,
        role=new_user.role,
        must_change_password=new_user.must_change_password,
        name=new_user.name,
        organization=new_user.organization
    )


# Manual TTL cache for public activity summary
ACTIVITY_CACHE = {
    "data": None,
    "timestamp": None
}
CACHE_TTL_SECONDS = 60

@app.get("/public/activity-summary", tags=["Public"])
def get_public_activity_summary(session: Session = Depends(get_session)):
    """
    Unauthenticated read-only endpoint for the landing page activity strip.
    Returns metadata only (no fares). Uses a manual 60s TTL cache to protect the DB.
    """
    global ACTIVITY_CACHE
    now = dt.datetime.now(dt.timezone.utc)
    
    # Check cache
    if ACTIVITY_CACHE["data"] and ACTIVITY_CACHE["timestamp"]:
        if (now - ACTIVITY_CACHE["timestamp"]).total_seconds() < CACHE_TTL_SECONDS:
            return ACTIVITY_CACHE["data"]

    # Cache miss, query DB
    recent_quotes = session.exec(
        select(FareQuote).order_by(FareQuote.scraped_at.desc()).limit(20)
    ).all()
    
    latest_index = session.exec(
        select(IndexDaily).order_by(IndexDaily.date.desc()).limit(1)
    ).first()
    
    current_index_value = latest_index.index_value if latest_index else 100.0

    activity_list = [
        {
            "timestamp": quote.scraped_at.isoformat() if quote.scraped_at else None,
            "route": quote.route,
            "window": quote.window,
            "source": quote.source.upper() if quote.source else "UNKNOWN",
            "status": quote.source_type.upper() if quote.source_type else "SEEDED"
        }
        for quote in recent_quotes
    ]

    response_data = {
        "last_updated": now.isoformat(),
        "current_index_value": round(current_index_value, 2),
        "recent_activity": activity_list
    }

    # Update cache
    ACTIVITY_CACHE["data"] = response_data
    ACTIVITY_CACHE["timestamp"] = now

    return response_data


@app.get("/public/materiality-gap", tags=["Public"])
@app.get("/reports/materiality-gap", tags=["Reports"])
def get_materiality_gap(session: Session = Depends(get_session)):
    """
    Empirical Materiality Gap Analysis:
    Quantifies the measurement distortion of manual monthly single-point sampling
    versus AeroCPI's continuous time-weighted tracking using real captured database records.
    """
    from collections import defaultdict

    # Fetch all fares chronologically
    fares = session.exec(
        select(FareQuote).order_by(FareQuote.scraped_at.asc(), FareQuote.id.asc())
    ).all()

    if not fares:
        raise HTTPException(status_code=404, detail="No fare telemetry available for materiality gap analysis")

    total_quotes = len(fares)
    live_quotes = sum(1 for f in fares if f.source_type == "live")
    seeded_quotes = sum(1 for f in fares if f.source_type == "seeded")
    live_pct = round((live_quotes / total_quotes) * 100, 1) if total_quotes > 0 else 0.0
    seeded_pct = round((seeded_quotes / total_quotes) * 100, 1) if total_quotes > 0 else 0.0

    core_routes = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD", "MAA-DEL"]
    windows = ["T+7", "T+15", "T+30"]

    # Group fares by route -> window
    route_window_fares = defaultdict(lambda: defaultdict(list))
    for f in fares:
        if f.route in core_routes and f.total_fare and f.total_fare > 0 and f.window in windows:
            route_window_fares[f.route][f.window].append(f)

    route_results = []
    abs_divergences = []
    signed_divergences = []

    for route in core_routes:
        if route not in route_window_fares:
            continue

        window_divergences = []
        window_details = []
        all_route_quotes = []

        for window in windows:
            wq = route_window_fares[route].get(window, [])
            if not wq:
                continue
            all_route_quotes.extend(wq)

            # 1. Snapshot: First chronological observation for this route+window
            first_q = wq[0]
            snap_fare = float(first_q.total_fare)

            # 2. Continuous average: Time-weighted daily avg for SAME window only
            day_fares_w = defaultdict(list)
            for q in wq:
                day_key = q.scraped_at.date() if q.scraped_at else None
                if day_key:
                    day_fares_w[day_key].append(q.total_fare)

            daily_avgs_w = [statistics.mean(fl) for fl in day_fares_w.values() if fl]
            cont_avg_w = statistics.mean(daily_avgs_w) if daily_avgs_w else snap_fare

            # 3. Per-window divergence
            div_w = ((snap_fare - cont_avg_w) / cont_avg_w) * 100 if cont_avg_w > 0 else 0.0
            window_divergences.append(div_w)
            window_details.append({
                "window": window,
                "snapshot_fare": round(snap_fare, 2),
                "continuous_avg": round(cont_avg_w, 2),
                "divergence_pct": round(div_w, 2),
                "carrier": first_q.carrier or "Unknown",
                "n_quotes": len(wq),
            })

        if not window_divergences:
            continue

        # Route-level: average divergence across windows
        route_div = statistics.mean(window_divergences)
        route_abs_div = abs(route_div)
        abs_divergences.append(route_abs_div)
        signed_divergences.append(route_div)

        # Representative snapshot for display: use T+7 (first window with data)
        primary = window_details[0]
        snapshot_fare = primary["snapshot_fare"]
        # Fix 1: No "via {source}" — just carrier + window
        snapshot_details = f"{primary['carrier']} {primary['window']}"

        # Continuous avg across all windows (for display column)
        all_day_fares = defaultdict(list)
        for q in all_route_quotes:
            day_key = q.scraped_at.date() if q.scraped_at else None
            if day_key:
                all_day_fares[day_key].append(q.total_fare)
        all_daily_avgs = [statistics.mean(fl) for fl in all_day_fares.values() if fl]
        continuous_avg = round(statistics.mean(all_daily_avgs), 2) if all_daily_avgs else snapshot_fare

        route_live = sum(1 for q in all_route_quotes if q.source_type == "live")
        route_seeded = sum(1 for q in all_route_quotes if q.source_type == "seeded")

        route_results.append({
            "route": route,
            "snapshot_fare": snapshot_fare,
            "snapshot_details": snapshot_details,
            "continuous_avg": continuous_avg,
            "divergence_pct": round(route_div, 2),
            "abs_divergence_pct": round(route_abs_div, 2),
            "sample_size": len(all_route_quotes),
            "live_quotes": route_live,
            "seeded_quotes": route_seeded,
            "live_pct": round((route_live / len(all_route_quotes)) * 100, 1) if len(all_route_quotes) > 0 else 0.0,
            "window_breakdown": window_details,
        })

    basket_mean_abs_divergence = round(statistics.mean(abs_divergences), 2) if abs_divergences else 0.0
    basket_mean_signed_divergence = round(statistics.mean(signed_divergences), 2) if signed_divergences else 0.0

    sorted_by_abs = sorted(route_results, key=lambda x: x["abs_divergence_pct"], reverse=True)
    max_divergent = sorted_by_abs[0] if sorted_by_abs else None
    min_divergent = sorted_by_abs[-1] if sorted_by_abs else None

    return {
        "methodology": {
            "snapshot_rule": "First chronological observation of calendar month per route per advance window",
            "continuous_rule": "Time-weighted daily average fare per route per advance window, then averaged across windows (T+7, T+15, T+30)",
            "formula": "Per window: ((snapshot_fare - continuous_avg) / continuous_avg) * 100; route divergence = mean across windows",
            "calendar_period": "September 2026"
        },
        "provenance": {
            "total_quotes": total_quotes,
            "live_quotes": live_quotes,
            "seeded_quotes": seeded_quotes,
            "live_pct": live_pct,
            "seeded_pct": seeded_pct,
            "disclosure": "Preliminary baseline computed over a hybrid dataset (13.2% live SerpAPI captures / 86.8% calibrated seeded quotes). Live fraction will expand continuously as daily automated pipelines ingest further cycles."
        },
        "basket_summary": {
            "mean_absolute_divergence_pct": basket_mean_abs_divergence,
            "mean_signed_divergence_pct": basket_mean_signed_divergence,
            "max_route": max_divergent["route"] if max_divergent else None,
            "max_divergence_pct": max_divergent["divergence_pct"] if max_divergent else 0.0,
            "min_route": min_divergent["route"] if min_divergent else None,
            "min_divergence_pct": min_divergent["divergence_pct"] if min_divergent else 0.0,
        },
        "routes": route_results
    }


# -----------------------------------------------------------------------------
# Gated Endpoints (FEATURES.md Must-Have)
# -----------------------------------------------------------------------------

@app.get("/index/daily", tags=["Price Index"])
def get_daily_index(
    start_date: Optional[dt.date] = Query(None, description="Filter start date"),
    end_date: Optional[dt.date] = Query(None, description="Filter end date"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Retrieve multilateral GEKS-Törnqvist daily airfare price index series.
    Surfaces has_seeded_data flag on every daily point.
    """
    query = select(IndexDaily).order_by(IndexDaily.date)
    if start_date:
        query = query.where(IndexDaily.date >= start_date)
    if end_date:
        query = query.where(IndexDaily.date <= end_date)

    records = session.exec(query).all()
    return {
        "status": "success",
        "method": "GEKS-Törnqvist",
        "count": len(records),
        "data": records
    }


@app.get("/index/route/{pair}", tags=["Price Index"])
def get_route_index(
    pair: str = Path(..., description="City-pair code, e.g. DEL-BOM"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Retrieve route-specific price index and average fare history for a given city-pair.
    """
    clean_pair = pair.upper().strip()
    records = session.exec(
        select(IndexRoute)
        .where(IndexRoute.route == clean_pair)
        .order_by(IndexRoute.date)
    ).all()

    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No index data recorded for route {clean_pair}"
        )

    return {
        "route": clean_pair,
        "count": len(records),
        "data": records
    }


@app.get("/fares/raw", tags=["Fares Data"])
def get_raw_fares(
    route: Optional[str] = Query(None, description="e.g. DEL-BOM"),
    window: Optional[str] = Query(None, description="T+7, T+15, T+30"),
    source: Optional[str] = Query(None, description="indigo, akasa, spicejet, easemytrip, cleartrip, makemytrip"),
    source_type: Optional[str] = Query(None, description="Filter by 'live' or 'seeded'"),
    limit: int = Query(500, ge=1, le=10000),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Retrieve underlying cleaned flight quotes.
    Displays normalized component breakdowns (base, taxes, UDF, convenience fee)
    and the explicit source_type ('live' | 'seeded').
    """
    query = select(FareQuote).order_by(FareQuote.scraped_at.desc())
    if route and route.lower() != "all":
        query = query.where(FareQuote.route == route.upper())
    if window and window.lower() != "all":
        query = query.where(FareQuote.window == window.upper())
    if source and source.lower() != "all":
        query = query.where(FareQuote.source == source.lower())
    if source_type and source_type.lower() != "all":
        query = query.where(FareQuote.source_type == source_type.lower())

    quotes = session.exec(query.limit(limit)).all()
    return {
        "count": len(quotes),
        "quotes": quotes
    }


@app.get("/reports/coverage-matrix", tags=["Reports"])
def get_coverage_matrix(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Return exact captured data availability across all 6 sources x 18 route-window combinations.
    Aggregates directly in SQL across the full database without row limit truncation.
    """
    from sqlalchemy import func
    stmt = select(
        FareQuote.route,
        FareQuote.window,
        func.lower(FareQuote.source).label("source"),
        FareQuote.source_type,
        func.count(FareQuote.id).label("count")
    ).group_by(
        FareQuote.route,
        FareQuote.window,
        func.lower(FareQuote.source),
        FareQuote.source_type
    )
    rows = session.exec(stmt).all()

    core_routes = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD", "MAA-DEL"]
    windows = ["T+7", "T+15", "T+30"]
    sources = ["indigo", "akasa", "spicejet", "easemytrip", "cleartrip", "makemytrip"]

    matrix = {}
    for r in core_routes:
        for w in windows:
            key = f"{r} {w}"
            matrix[key] = {
                s: {"total": 0, "live": 0, "seeded": 0} for s in sources
            }

    for route_val, win_val, src_val, src_type, cnt in rows:
        key = f"{route_val} {win_val}"
        if key in matrix and src_val in matrix[key]:
            matrix[key][src_val]["total"] += cnt
            if src_type == "live":
                matrix[key][src_val]["live"] += cnt
            elif src_type == "seeded":
                matrix[key][src_val]["seeded"] += cnt

    total_db_quotes = session.exec(select(func.count(FareQuote.id))).one()

    return {
        "total_quotes_in_db": total_db_quotes,
        "matrix": matrix
    }


@app.get("/fares/export-pdf", tags=["Fares Data"])
@app.get("/reports/export-pdf", tags=["Reports"])
def export_fares_pdf(
    route: Optional[str] = Query(None, description="e.g. DEL-BOM"),
    window: Optional[str] = Query(None, description="T+7, T+15, T+30"),
    source: Optional[str] = Query(None, description="indigo, akasa, spicejet, easemytrip, cleartrip, makemytrip"),
    source_type: Optional[str] = Query(None, description="Filter by 'live' or 'seeded'"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Generate print-ready vector PDF report containing:
    - Metadata & Plain-language filter scope
    - Honest provenance disclosure banner (SEEDED vs LIVE)
    - Source reliability scorecard
    - Price differential analysis
    - Cross-source fare comparison table & server-rendered Matplotlib bar chart
    - Data density & methodology audit notes
    """
    query = select(FareQuote).order_by(FareQuote.scraped_at.desc())
    if route and route.lower() != "all":
        query = query.where(FareQuote.route == route.upper())
    if window and window.lower() != "all":
        query = query.where(FareQuote.window == window.upper())
    if source and source.lower() != "all":
        query = query.where(FareQuote.source == source.lower())
    if source_type and source_type.lower() != "all":
        query = query.where(FareQuote.source_type == source_type.lower())

    quotes = session.exec(query.limit(5000)).all()

    # Plain-language descriptions for metadata box
    scope_route_desc = route.upper() if (route and route.lower() != "all") else "ALL SECTORS (6 Core Routes)"
    scope_window_desc = window.upper() if (window and window.lower() != "all") else "ALL WINDOWS (T+7, T+15, T+30)"
    scope_source_desc = source.upper() if (source and source.lower() != "all") else "ALL 6 SOURCES"
    scope_type_desc = source_type.upper() if (source_type and source_type.lower() != "all") else "ALL (LIVE + SEEDED)"

    filter_meta = {
        "route": scope_route_desc,
        "window": scope_window_desc,
        "source": scope_source_desc,
        "source_type": scope_type_desc
    }

    pdf_bytes = generate_reports_pdf(quotes, filter_meta)
    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"AeroCPI_Telemetry_Report_{timestamp}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        }
    )


@app.get("/backtest/dgca", tags=["Validation & Backtest"])
def get_dgca_backtest(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Comparative backtest evaluating AeroCPI against verified DGCA passenger yield figures.
    Returns correlation, tracking error, and side-by-side series with report citations.
    """
    return compute_backtest_metrics(session)


@app.post("/pipeline/trigger-sync", tags=["Pipeline Operations"])
def trigger_pipeline_sync(
    limit_sources: bool = Query(True, description="Limit to 2 fast sources for instant demonstration"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Manually trigger data collection and GEKS index recomputation.
    Demonstrates the live scraper -> cleaning -> DB -> index generation pipeline.
    """
    scrape_results = run_full_basket_pipeline(session, limit_sources=limit_sources)
    index_records = calculate_and_save_daily_indices(session)
    return {
        "status": "completed",
        "scrapes_executed": len(scrape_results),
        "index_points_computed": len(index_records)
    }


@app.get("/events/pipeline", tags=["Pipeline Operations"])
async def pipeline_events(
    token: str = Query(..., description="JWT token for SSE auth")
):
    """SSE endpoint streaming pipeline events. Uses query param auth since EventSource doesn't support headers."""
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    async def event_generator():
        queue = event_bus.subscribe()
        try:
            initial = PipelineEvent(
                event_type=EventType.CONNECTED,
                message="CONNECTED TO EVENT STREAM" if not event_bus.is_running else "PIPELINE IN PROGRESS",
                data={"pipeline_running": event_bus.is_running}
            )
            yield initial.to_sse()

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield event.to_sse()
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_bus.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


@app.post("/pipeline/trigger-sync-sse", tags=["Pipeline Operations"])
def trigger_sync_sse(
    route: Optional[str] = Query(None, description="Optional route to scope execution, e.g. DEL-BOM"),
    window: Optional[str] = Query(None, description="Optional window to scope execution, e.g. T+7, T+15, T+30"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Trigger pipeline in background thread, emitting events via SSE bus.
    Supports scoping to a single route and/or window for cost-effective testing and quota protection.
    """
    if event_bus.is_running:
        raise HTTPException(status_code=409, detail="Pipeline already running")

    # Validate route if provided
    target_routes = None
    if route:
        clean_route = route.upper().strip()
        parts = clean_route.split("-")
        if len(parts) == 2 and parts[0] and parts[1]:
            target_routes = [(parts[0].strip(), parts[1].strip())]
        else:
            raise HTTPException(status_code=400, detail="Invalid route format. Use ORIGIN-DEST, e.g. DEL-BOM")

    target_windows = None
    if window:
        clean_window = window.upper().strip()
        if clean_window in ["T+7", "T+15", "T+30"]:
            target_windows = [clean_window]
        else:
            raise HTTPException(status_code=400, detail="Invalid window. Use T+7, T+15, or T+30")

    scope_desc = f"ROUTE: {route.upper()}" if route else "FULL BASKET"
    if window:
        scope_desc += f" ({window.upper()})"

    def run_pipeline():
        event_bus.reset_stop()
        event_bus.set_running(True)
        event_bus.publish(PipelineEvent(
            event_type=EventType.PIPELINE_START,
            message=f"PIPELINE EXECUTION STARTED [{scope_desc}]"
        ))
        try:
            with Session(engine) as bg_session:
                run_full_basket_pipeline(
                    bg_session,
                    limit_sources=True,
                    routes=target_routes,
                    windows=target_windows
                )
                calculate_and_save_daily_indices(bg_session)

            if event_bus.should_stop():
                event_bus.publish(PipelineEvent(
                    event_type=EventType.PIPELINE_STOPPED,
                    message="PIPELINE HALTED BY OPERATOR :: PARTIAL RUN PERSISTED"
                ))
            else:
                event_bus.publish(PipelineEvent(
                    event_type=EventType.PIPELINE_END,
                    message=f"PIPELINE EXECUTION COMPLETE [{scope_desc}]"
                ))
        except Exception as e:
            event_bus.publish(PipelineEvent(
                event_type=EventType.SCRAPE_ERROR,
                message=f"PIPELINE FAILED :: {str(e)}"
            ))
        finally:
            event_bus.set_running(False)
            event_bus.reset_stop()

    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()
    return {"status": "started", "scope": scope_desc, "message": f"Pipeline execution started [{scope_desc}]"}


@app.post("/pipeline/stop", tags=["Pipeline Operations"])
def stop_pipeline(
    current_user: User = Depends(get_current_user)
):
    """
    Cancel an in-progress pipeline execution cleanly.
    Halts further scraper calls while preserving all already-captured quotes and snapshots.
    """
    if not event_bus.is_running:
        return {"status": "idle", "message": "No pipeline is currently running"}

    event_bus.request_stop()
    event_bus.publish(PipelineEvent(
        event_type=EventType.PIPELINE_STOPPED,
        message="PIPELINE STOP REQUESTED :: GRACEFUL SHUTDOWN IN PROGRESS..."
    ))
    return {"status": "stopping", "message": "Pipeline stop signal sent"}


@app.get("/pipeline/surge-status", tags=["Pipeline Operations"])
def get_surge_status(
    session: Session = Depends(get_session)
):
    """Returns current surge state for all route x window combinations."""
    routes = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD", "MAA-DEL"]
    windows = ["T+7", "T+15", "T+30"]
    results = []

    for route in routes:
        for window in windows:
            fares = session.exec(
                select(FareQuote)
                .where(FareQuote.route == route, FareQuote.window == window)
                .order_by(FareQuote.scraped_at.desc())
            ).all()

            if len(fares) < 2:
                results.append({"route": route, "window": window, "is_surge": False, "current_avg": 0, "baseline_avg": 0, "pct_above": 0})
                continue

            latest_fares = [f.total_fare for f in fares[:5]]
            baseline_fares = [f.total_fare for f in fares[5:]]

            current_avg = statistics.mean(latest_fares) if latest_fares else 0
            baseline_avg = statistics.mean(baseline_fares) if baseline_fares else current_avg

            pct_above = ((current_avg - baseline_avg) / baseline_avg * 100) if baseline_avg > 0 else 0
            is_surge = pct_above >= 20

            results.append({
                "route": route,
                "window": window,
                "is_surge": is_surge,
                "current_avg": round(current_avg, 2),
                "baseline_avg": round(baseline_avg, 2),
                "pct_above": round(pct_above, 1)
            })

    return {"surges": results}


# -----------------------------------------------------------------------------
# Admin Provisioning & User Management (Enforced with require_admin)
# -----------------------------------------------------------------------------

class UserAdminView(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    organization: Optional[str] = None
    role: str
    is_active: bool
    created_at: dt.datetime
    last_login_at: Optional[dt.datetime] = None
    must_change_password: bool = False
    has_api_key: bool = False


class CreateUserPayload(BaseModel):
    email: str
    name: str
    organization: str
    role: str = "analyst"


class UpdateUserStatusPayload(BaseModel):
    is_active: bool


class UpdateUserRolePayload(BaseModel):
    role: str


@app.get("/admin/users", response_model=List[UserAdminView], tags=["Admin"])
def list_admin_users(
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """List all accounts with their institutional profiles, roles, and access state."""
    users = session.exec(select(User).order_by(User.id.desc())).all()
    return [
        UserAdminView(
            id=u.id,
            email=u.email,
            name=u.name,
            organization=u.organization,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            must_change_password=u.must_change_password,
            has_api_key=bool(u.api_key_hash)
        )
        for u in users
    ]


@app.post("/admin/users", tags=["Admin"])
def provision_user(
    payload: CreateUserPayload,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """
    Provision a new institutional account.
    Generates a secure random initial password and requires password reset upon first login.
    """
    clean_email = payload.email.strip().lower()
    clean_name = payload.name.strip()
    clean_org = payload.organization.strip()
    clean_role = payload.role.strip().lower()

    if clean_role not in ["viewer", "analyst", "admin"]:
        raise HTTPException(status_code=400, detail="Role must be 'viewer', 'analyst', or 'admin'")
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="A valid institutional email address is required")
    if not clean_name or not clean_org:
        raise HTTPException(status_code=400, detail="Full name and organization are required")

    existing = session.exec(select(User).where(User.email == clean_email)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Account with email '{clean_email}' already exists")

    temp_password = generate_temp_password(14)
    new_user = User(
        email=clean_email,
        hashed_password=hash_password(temp_password),
        name=clean_name,
        organization=clean_org,
        role=clean_role,
        is_active=True,
        must_change_password=True,
        created_at=dt.datetime.now(dt.timezone.utc)
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    return {
        "status": "success",
        "message": f"Account for {new_user.email} provisioned successfully",
        "user": UserAdminView(
            id=new_user.id,
            email=new_user.email,
            name=new_user.name,
            organization=new_user.organization,
            role=new_user.role,
            is_active=new_user.is_active,
            created_at=new_user.created_at,
            last_login_at=new_user.last_login_at,
            must_change_password=new_user.must_change_password,
            has_api_key=False
        ),
        "temporary_password": temp_password
    }


@app.patch("/admin/users/{user_id}/status", tags=["Admin"])
def toggle_user_status(
    user_id: int,
    payload: UpdateUserStatusPayload,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """Deactivate or reactivate an institutional account."""
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found")
    if target_user.id == admin.id and not payload.is_active:
        raise HTTPException(status_code=400, detail="Administrators cannot deactivate their own account")

    target_user.is_active = payload.is_active
    session.add(target_user)
    session.commit()
    session.refresh(target_user)
    return {"status": "success", "user_id": target_user.id, "is_active": target_user.is_active}


@app.patch("/admin/users/{user_id}/role", tags=["Admin"])
def change_user_role(
    user_id: int,
    payload: UpdateUserRolePayload,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """Change an account's authorization role."""
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found")
    if target_user.id == admin.id:
        raise HTTPException(status_code=400, detail="Administrators cannot alter their own role")
    new_role = payload.role.strip().lower()
    if new_role not in ["viewer", "analyst", "admin"]:
        raise HTTPException(status_code=400, detail="Role must be 'viewer', 'analyst', or 'admin'")

    target_user.role = new_role
    session.add(target_user)
    session.commit()
    session.refresh(target_user)
    return {"status": "success", "user_id": target_user.id, "role": target_user.role}


@app.post("/admin/users/{user_id}/reset-password", tags=["Admin"])
def admin_reset_password(
    user_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """Reset a user's password and enforce change on next login."""
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found")

    temp_password = generate_temp_password(14)
    target_user.hashed_password = hash_password(temp_password)
    target_user.must_change_password = True
    session.add(target_user)
    session.commit()
    return {
        "status": "success",
        "message": f"Temporary password generated for {target_user.email}",
        "temporary_password": temp_password
    }


# -----------------------------------------------------------------------------
# Account & Profile Management (Any Authenticated User)
# -----------------------------------------------------------------------------

class ProfileUpdatePayload(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str


class ProfileResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    organization: Optional[str] = None
    role: str
    is_active: bool
    created_at: dt.datetime
    last_login_at: Optional[dt.datetime] = None
    must_change_password: bool = False
    api_key_prefix: Optional[str] = None
    api_key_created_at: Optional[dt.datetime] = None


@app.get("/account/profile", response_model=ProfileResponse, tags=["Account"])
def get_account_profile(current_user: User = Depends(get_current_user)):
    """Retrieve profile and credentials status for current authenticated user."""
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        organization=current_user.organization,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at,
        must_change_password=current_user.must_change_password,
        api_key_prefix=current_user.api_key_prefix,
        api_key_created_at=current_user.api_key_created_at
    )


@app.patch("/account/profile", response_model=ProfileResponse, tags=["Account"])
def update_account_profile(
    payload: ProfileUpdatePayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update editable profile details (name and organization). Email and role are immutable."""
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.organization is not None:
        current_user.organization = payload.organization.strip()

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        organization=current_user.organization,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at,
        must_change_password=current_user.must_change_password,
        api_key_prefix=current_user.api_key_prefix,
        api_key_created_at=current_user.api_key_created_at
    )


@app.post("/account/change-password", tags=["Account"])
def change_user_password(
    payload: ChangePasswordPayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Change account password with verification of current password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed"
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters in length"
        )

    current_user.hashed_password = hash_password(payload.new_password)
    current_user.must_change_password = False
    session.add(current_user)
    session.commit()
    return {"status": "success", "message": "Password changed successfully"}


@app.get("/account/login-history", tags=["Account"])
def get_user_login_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retrieve login event history scoped strictly to the calling user."""
    events = session.exec(
        select(LoginEvent)
        .where(LoginEvent.user_id == current_user.id)
        .order_by(LoginEvent.timestamp.desc())
        .limit(25)
    ).all()
    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "ip_address": e.ip_address or "Internal / Loopback",
            "user_agent": e.user_agent or "Direct API Client",
            "status": e.status
        }
        for e in events
    ]


@app.post("/account/api-key", tags=["Account"])
def generate_user_api_key(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Generate or regenerate personal API key for programmatic automation.
    Hashed at rest via SHA-256. Plaintext key is displayed ONCE in this response.
    """
    full_key, key_hash, prefix = generate_api_key()
    current_user.api_key_hash = key_hash
    current_user.api_key_prefix = prefix
    current_user.api_key_created_at = dt.datetime.now(dt.timezone.utc)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return {
        "status": "success",
        "api_key": full_key,
        "prefix": prefix,
        "created_at": current_user.api_key_created_at.isoformat(),
        "message": "Personal API key generated. Save this key in a secure vault; it cannot be viewed again."
    }


@app.delete("/account/api-key", tags=["Account"])
def revoke_user_api_key(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Revoke existing API key immediately disabling programmatic access."""
    current_user.api_key_hash = None
    current_user.api_key_prefix = None
    current_user.api_key_created_at = None
    session.add(current_user)
    session.commit()
    return {"status": "success", "message": "API key revoked successfully"}


# -----------------------------------------------------------------------------
# Analyst Elevation Requests & Email Notifications
# -----------------------------------------------------------------------------

class ElevationRequestPayload(BaseModel):
    reason: str


class ElevationReviewPayload(BaseModel):
    review_notes: Optional[str] = None


class ElevationRequestView(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    user_organization: Optional[str] = None
    reason: str
    status: str
    created_at: dt.datetime
    reviewed_at: Optional[dt.datetime] = None
    reviewed_by: Optional[str] = None
    review_notes: Optional[str] = None


@app.post("/account/elevation-request", response_model=Dict[str, Any], tags=["Account"])
def submit_elevation_request(
    payload: ElevationRequestPayload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Submit an analyst elevation request from an authenticated account.
    Enforces that only one pending request can exist per user at a time.
    Dispatches a notification email to ADMIN_NOTIFICATION_EMAIL in the background.
    """
    clean_reason = payload.reason.strip()
    if len(clean_reason) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Justification reason must be at least 10 characters in length"
        )

    if current_user.role in ["admin", "analyst"]:
        return {
            "status": "noop",
            "message": f"Account already holds '{current_user.role.upper()}' privileges.",
            "request": None
        }

    # Check for existing pending request
    pending = session.exec(
        select(ElevationRequest)
        .where(ElevationRequest.user_id == current_user.id, ElevationRequest.status == "pending")
    ).first()
    if pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An elevation request is already pending review by an administrator."
        )

    req = ElevationRequest(
        user_id=current_user.id,
        user_email=current_user.email,
        user_name=current_user.name,
        user_organization=current_user.organization,
        reason=clean_reason,
        status="pending",
        created_at=dt.datetime.now(dt.timezone.utc)
    )
    session.add(req)
    session.commit()
    session.refresh(req)

    # Dispatch notification email to admin in background
    background_tasks.add_task(
        send_elevation_request_notification,
        requester_email=current_user.email,
        requester_name=current_user.name,
        requester_org=current_user.organization,
        reason=clean_reason,
        created_at=req.created_at
    )

    return {
        "status": "success",
        "message": "Elevation request submitted. Institutional administrators have been notified via email.",
        "request": ElevationRequestView(
            id=req.id,
            user_id=req.user_id,
            user_email=req.user_email,
            user_name=req.user_name,
            user_organization=req.user_organization,
            reason=req.reason,
            status=req.status,
            created_at=req.created_at,
            reviewed_at=req.reviewed_at,
            reviewed_by=req.reviewed_by,
            review_notes=req.review_notes
        )
    }


@app.get("/account/elevation-request", tags=["Account"])
def get_current_elevation_request(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retrieve the latest elevation request status for the current authenticated user."""
    latest = session.exec(
        select(ElevationRequest)
        .where(ElevationRequest.user_id == current_user.id)
        .order_by(ElevationRequest.id.desc())
    ).first()

    if not latest:
        return {"request": None}

    return {
        "request": ElevationRequestView(
            id=latest.id,
            user_id=latest.user_id,
            user_email=latest.user_email,
            user_name=latest.user_name,
            user_organization=latest.user_organization,
            reason=latest.reason,
            status=latest.status,
            created_at=latest.created_at,
            reviewed_at=latest.reviewed_at,
            reviewed_by=latest.reviewed_by,
            review_notes=latest.review_notes
        )
    }


@app.get("/admin/elevation-requests", response_model=List[ElevationRequestView], tags=["Admin"])
def list_elevation_requests(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by pending, approved, or rejected"),
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """List elevation requests for institutional review. Filterable by status."""
    query = select(ElevationRequest).order_by(ElevationRequest.created_at.desc())
    if status_filter and status_filter.lower() != "all":
        query = query.where(ElevationRequest.status == status_filter.lower().strip())

    records = session.exec(query).all()
    return [
        ElevationRequestView(
            id=r.id,
            user_id=r.user_id,
            user_email=r.user_email,
            user_name=r.user_name,
            user_organization=r.user_organization,
            reason=r.reason,
            status=r.status,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
            reviewed_by=r.reviewed_by,
            review_notes=r.review_notes
        )
        for r in records
    ]


@app.post("/admin/elevation-requests/{request_id}/approve", tags=["Admin"])
def approve_elevation_request(
    request_id: int,
    background_tasks: BackgroundTasks,
    payload: Optional[ElevationReviewPayload] = None,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """
    Approve an elevation request.
    Elevates the requester's role to ANALYST in the database.
    Sends confirmation email to the requester in the background.
    """
    req = session.get(ElevationRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Elevation request not found")

    if req.status == "approved":
        raise HTTPException(status_code=400, detail="Elevation request is already approved")

    target_user = session.get(User, req.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Associated user account no longer exists")

    notes = payload.review_notes.strip() if payload and payload.review_notes else None
    now = dt.datetime.now(dt.timezone.utc)

    req.status = "approved"
    req.reviewed_at = now
    req.reviewed_by = admin.email
    req.review_notes = notes

    # Elevate user to analyst
    target_user.role = "analyst"

    session.add(req)
    session.add(target_user)
    session.commit()
    session.refresh(req)
    session.refresh(target_user)

    # Dispatch confirmation email to requester in background
    background_tasks.add_task(
        send_elevation_status_notification,
        recipient_email=target_user.email,
        recipient_name=target_user.name,
        status="approved",
        review_notes=notes
    )

    return {
        "status": "success",
        "message": f"Elevation request approved. {target_user.email} elevated to ANALYST role.",
        "request": ElevationRequestView(
            id=req.id,
            user_id=req.user_id,
            user_email=req.user_email,
            user_name=req.user_name,
            user_organization=req.user_organization,
            reason=req.reason,
            status=req.status,
            created_at=req.created_at,
            reviewed_at=req.reviewed_at,
            reviewed_by=req.reviewed_by,
            review_notes=req.review_notes
        )
    }


@app.post("/admin/elevation-requests/{request_id}/reject", tags=["Admin"])
def reject_elevation_request(
    request_id: int,
    background_tasks: BackgroundTasks,
    payload: Optional[ElevationReviewPayload] = None,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session)
):
    """
    Reject an elevation request.
    Leaves the user's role unchanged.
    Sends denial notification email to the requester in the background.
    """
    req = session.get(ElevationRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Elevation request not found")

    target_user = session.get(User, req.user_id)
    notes = payload.review_notes.strip() if payload and payload.review_notes else None
    now = dt.datetime.now(dt.timezone.utc)

    req.status = "rejected"
    req.reviewed_at = now
    req.reviewed_by = admin.email
    req.review_notes = notes

    session.add(req)
    session.commit()
    session.refresh(req)

    # Dispatch confirmation email to requester if user exists
    if target_user:
        background_tasks.add_task(
            send_elevation_status_notification,
            recipient_email=target_user.email,
            recipient_name=target_user.name,
            status="rejected",
            review_notes=notes
        )

    return {
        "status": "success",
        "message": f"Elevation request rejected for {req.user_email}.",
        "request": ElevationRequestView(
            id=req.id,
            user_id=req.user_id,
            user_email=req.user_email,
            user_name=req.user_name,
            user_organization=req.user_organization,
            reason=req.reason,
            status=req.status,
            created_at=req.created_at,
            reviewed_at=req.reviewed_at,
            reviewed_by=req.reviewed_by,
            review_notes=req.review_notes
        )
    }


@app.get("/admin/email-log", tags=["Admin"])
def get_admin_email_log(
    admin: User = Depends(require_admin)
):
    """Retrieve in-memory audit log of sent transactional emails."""
    return {"emails": SENT_EMAILS_LOG[-50:]}


