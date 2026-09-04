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

from fastapi import FastAPI, Depends, HTTPException, status, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from starlette.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.database import get_session, create_db_and_tables, init_seed_user, engine
from backend.app.models import User, FareQuote, IndexDaily, IndexRoute, DGCABenchmark
from backend.app.security import verify_password, create_access_token, decode_access_token
from backend.app.dgca.ingestion import ingest_dgca_csv
from backend.app.dgca.backtest import compute_backtest_metrics
from backend.app.scraper.basket_runner import run_full_basket_pipeline
from backend.app.index.geks import calculate_and_save_daily_indices
from backend.app.events import event_bus, PipelineEvent, EventType


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


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


class LoginPayload(BaseModel):
    email: str
    password: str


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session)
) -> User:
    """Validate Bearer JWT token and return authenticated User."""
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
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    """
    OAuth2 compatible token login.
    Uses Argon2 verification for demo analyst credentials.
    """
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user_email=user.email,
        role=user.role
    )


@app.post("/auth/login", response_model=TokenResponse, tags=["Authentication"])
def json_login(
    payload: LoginPayload,
    session: Session = Depends(get_session)
):
    """JSON-body login for Next.js frontend consumption."""
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user_email=user.email,
        role=user.role
    )


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
    source: Optional[str] = Query(None, description="indigo, akasa, easemytrip, cleartrip"),
    source_type: Optional[str] = Query(None, description="Filter by 'live' or 'seeded'"),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Retrieve underlying cleaned flight quotes.
    Displays normalized component breakdowns (base, taxes, UDF, convenience fee)
    and the explicit source_type ('live' | 'seeded').
    """
    query = select(FareQuote).order_by(FareQuote.scraped_at.desc())
    if route:
        query = query.where(FareQuote.route == route.upper())
    if window:
        query = query.where(FareQuote.window == window.upper())
    if source:
        query = query.where(FareQuote.source == source.lower())
    if source_type:
        query = query.where(FareQuote.source_type == source_type.lower())

    quotes = session.exec(query.limit(limit)).all()
    return {
        "count": len(quotes),
        "quotes": quotes
    }


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
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Trigger pipeline in background thread, emitting events via SSE bus."""
    if event_bus.is_running:
        raise HTTPException(status_code=409, detail="Pipeline already running")

    def run_pipeline():
        event_bus.set_running(True)
        event_bus.publish(PipelineEvent(
            event_type=EventType.PIPELINE_START,
            message="PIPELINE EXECUTION STARTED"
        ))
        try:
            with Session(engine) as bg_session:
                run_full_basket_pipeline(bg_session, limit_sources=True)
                calculate_and_save_daily_indices(bg_session)
            event_bus.publish(PipelineEvent(
                event_type=EventType.PIPELINE_END,
                message="PIPELINE EXECUTION COMPLETE"
            ))
        except Exception as e:
            event_bus.publish(PipelineEvent(
                event_type=EventType.SCRAPE_ERROR,
                message=f"PIPELINE FAILED :: {str(e)}"
            ))
        finally:
            event_bus.set_running(False)

    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()
    return {"status": "started", "message": "Pipeline execution started in background"}


@app.get("/pipeline/surge-status", tags=["Pipeline Operations"])
def get_surge_status(
    current_user: User = Depends(get_current_user),
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
