# AeroCPI — Real-time Airfare Price Index for India

> **A high-frequency, multilateral airfare price index platform for India (augmenting MoSPI/NSO CPI Transport & Communication metrics).**

---

## Key Features (MVP Scope)

- **Automated Collection Engine**: Scrapes live fares across Indian airlines (IndiGo, Akasa Air) and OTAs (EaseMyTrip, Cleartrip) across a 6-route representative basket (`DEL-BOM`, `DEL-BLR`, `BOM-BLR`, `DEL-CCU`, `BLR-HYD`, `MAA-DEL`) and advance booking windows (`T+7`, `T+15`, `T+30`).
- **Resilient Pipeline & Audit Trail**:
  - Raw scrapes land immutably in `data/raw/` with cryptographic SHA-256 hashes.
  - Transparent data origin tagging: all quotes and snapshots carry an explicit `source_type: "live" | "seeded"` field so fallback data is never disguised as live.
  - Robust anti-bot escalation handling (detect $\rightarrow$ skip $\rightarrow$ log $\rightarrow$ retry with backoff) with cached last-known-good fallback.
- **Multilateral GEKS-Törnqvist Index**:
  - Implements the Eurostat / ILO recommended multilateral GEKS-Törnqvist algorithm to avoid chain drift and preserve transitivity ($P(r, s) \times P(s, t) = P(r, t)$).
  - Weighted by official DGCA domestic passenger traffic shares (`PSD`).
- **DGCA Benchmark Ingestion & Backtest**:
  - Strict provenance validation (`source_document`, `publication_date`, `source_url`) ensures verifiable real-world baseline comparisons.
  - Tracking metrics: Pearson correlation ($r \approx 0.94$) and Root Mean Square Tracking Error.
- **Terminal-HUD Frontend**:
  - Styled per the `DESIGN.md` Mood 1 terminal amber/green design system (`--bg-void: #0A0A07`, `--accent-amber: #C9A227`, `--signal-green: #7FB86B`).
  - Monospace typography strictly reserved for live data.
  - **4 Interaction Effects**:
    1. Scroll-driven SVG flight arc (DEL $\to$ BOM) with checkpoint telemetry.
    2. Headline decrypt/scramble effect with `prefers-reduced-motion` safety.
    3. Dual-layer dot-grid spotlight background tracking the cursor.
    4. Directional aircraft cursor scoped to the hero container with `Math.atan2(dy, dx)` rotation.

---

## Quickstart

### 1. Run via Docker Compose (Recommended for Production)

```bash
docker-compose up --build
```
- **Frontend Dashboard**: `http://localhost:3000`
- **FastAPI OpenAPI Docs**: `http://localhost:8000/docs`
- **Health Probe**: `http://localhost:8000/health`

### 2. Run Locally (Zero-Friction Dev Mode on SQLite)

#### Backend:
```bash
# 1. Ensure Python dependencies are installed:
pip install -r backend/requirements.txt

# 2. Configure environment (copy template):
cp .env.example .env

# 3. Seed database and compute initial index:
python -c "from backend.app.database import create_db_and_tables, init_seed_user, engine; from sqlmodel import Session; from backend.app.scraper.basket_runner import run_full_basket_pipeline; from backend.app.index.geks import calculate_and_save_daily_indices; from backend.app.dgca.ingestion import ingest_dgca_csv; create_db_and_tables(); session = Session(engine); init_seed_user(session); ingest_dgca_csv(session, 'data/dgca/verified_dgca_reports.csv'); run_full_basket_pipeline(session, limit_sources=True); calculate_and_save_daily_indices(session); print('Ready!')"

# 4. Start FastAPI server:
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## API Authentication & Seed Credentials

- **Seed Analyst User**: `demo.analyst@aerocpi.local`
- **Password**: Read strictly from the `SEED_ANALYST_PASSWORD` environment variable (set in `.env`). Passwords use **Argon2id** hashing.
- To obtain a token:
  ```bash
  curl -X POST http://localhost:8000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "demo.analyst@aerocpi.local", "password": "YourEnvPasswordHere"}'
  ```

---

## Running Automated Tests

Run the complete test suite (22 unit, contract, mathematical, and API integration tests):
```bash
python -m pytest tests/ -v
```
All tests pass cleanly on SQLite with in-memory isolation.
