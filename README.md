# Graewatch

A forex market structure analysis dashboard built around Smart Money Concepts (SMC). Graewatch fetches historical candlestick data, runs eight detection algorithms to identify patterns like Break of Structure, Fair Value Gaps, Order Blocks, and Liquidity Sweeps, then scores confluence zones across multiple timeframes and presents actionable trade setups on an interactive chart.

## Project Structure

```
graewatch/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── primitives/  # Custom chart overlays (BOS, FVG, OB, etc.)
│       │   ├── CandlestickChart.jsx
│       │   ├── ChecklistSidebar.jsx
│       │   ├── DashboardOverview.jsx
│       │   ├── IntroScreen.jsx
│       │   ├── SetupCard.jsx
│       │   ├── SnapshotHistory.jsx
│       │   └── ...
│       ├── context/         # Dashboard state management (useReducer)
│       └── content.json     # Externalised UI strings
├── server/                  # Python backend (FastAPI)
│   ├── routes/              # API endpoints
│   │   ├── candles.py       # OHLC data fetch & cache
│   │   ├── analysis.py      # Single-engine analysis
│   │   ├── setup.py         # Trade setup detection
│   │   ├── confluence.py    # Multi-TF confluence scoring
│   │   ├── snapshots.py     # Snapshot CRUD
│   │   ├── auth.py          # Register / login / current user
│   │   └── intervals.py     # Interval normalisation helpers
│   ├── engine/              # Detection algorithms
│   │   ├── bos.py           # Break of Structure
│   │   ├── fvg.py           # Fair Value Gaps
│   │   ├── orderblocks.py   # Order Blocks
│   │   ├── liquidity.py     # Liquidity sweeps & pools
│   │   ├── wyckoff.py       # Wyckoff phase detection
│   │   ├── gann.py          # Gann boxes
│   │   ├── confluence.py    # Multi-TF confluence engine
│   │   ├── setup.py         # Entry/Target/Stop/R:R detection
│   │   ├── zones.py         # Zone detection & scoring
│   │   └── ...
│   ├── utils/
│   │   ├── precision.py     # Decimal ↔ float conversion
│   │   ├── audit.py         # Logging & performance tracking
│   │   └── auth.py          # JWT + bcrypt helpers
│   ├── eval/                # Walk-forward backtest & perf scripts
│   │   ├── run_backtest.py  # Trade-by-trade evaluation harness
│   │   └── run_perf.py      # Engine timing benchmarks
│   └── tests/               # Unit & route tests (pytest)
└── .env                     # Environment variables (not committed)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, [lightweight-charts](https://github.com/tradingview/lightweight-charts) (TradingView) |
| Backend | FastAPI, Motor (async MongoDB driver), HTTPX |
| Database | MongoDB |
| Auth | JWT (PyJWT) + bcrypt password hashing |
| Data Source | [TwelveData API](https://twelvedata.com/) |

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB running locally or a cloud instance (e.g. MongoDB Atlas)
- A TwelveData API key (free tier works)

### Setup

1. Clone the repo and create a `.env` file in the root directory:

```
TWELVE_DATA_API_KEY=your_api_key_here
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=any_long_random_string
```

2. Start the backend:

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

3. Start the frontend:

```bash
cd client
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend on port 8000.

### Running Tests

```bash
cd server
source .venv/bin/activate
python -m pytest -v
```

The pytest suite covers detection engines (BOS, FVG, Gann, Liquidity, Order Blocks, Wyckoff, Setup, Confluence), zone scoring/clustering/adapters, interval normalisation, decimal precision, and the auth + snapshots routes.

### Evaluation Scripts

Reproducible scripts used for the dissertation evaluation chapter live under `server/eval/`:

```bash
cd server
python eval/run_backtest.py                 # walk-forward backtest, JSON + per-trade CSVs
python eval/run_perf.py                     # per-engine timing benchmarks
```

Outputs are written to `server/eval/results/`.

## Features

### Detection Engines

Eight algorithms identify SMC patterns from raw OHLC data:

| Engine | Description |
|---|---|
| **BOS** | Break of Structure — detects when price breaks past recent swing highs/lows |
| **FVG** | Fair Value Gaps — highlights price imbalances and tracks when they get filled |
| **Order Blocks** | Identifies institutional supply/demand zones from strong moves |
| **Liquidity** | Detects liquidity sweeps (stop hunts) and equal-high/low pools |
| **Wyckoff** | Phase detection — accumulation/distribution ranges |
| **Gann** | Gann box overlays for time/price symmetry analysis |
| **Confluence** | Multi-timeframe zone scoring — ranks zones by cross-TF overlap |
| **Setup** | Derives Entry POI, Target, Stop Loss, and Risk:Reward from combined signals |

### Interactive Chart

- Candlestick rendering via TradingView lightweight-charts
- 9 custom chart primitives (BOS lines, FVG boxes, OB boxes, Gann boxes, Liquidity lines, Wyckoff markers, Setup levels, Confluence zones, Selection box)
- Per-indicator overlay toggles
- Selection tool — draw a time range to scope analysis

### SMC Checklist

A guided step-by-step workflow that walks through top-down analysis:
1. Pre-flight — select pair and confirm data is loaded
2. HTF Bias — check weekly/daily structure
3. Intermediate Structure — confirm 4H/1H alignment
4. Entry Timeframe — identify 15min confluence zones
5. Setup Validation — review entry/target/stop geometry

### Confidence Indicator

A 0–100 score computed from four weighted factors:
- Bias chain alignment across timeframes (0–30)
- Zone quality / conviction score (0–25)
- Setup validity and R:R quality (0–25)
- Structural factors: POI proximity, liquidity, clustering (0–20)

### Simulation Journal

- Save trade setups as snapshots with chart screenshots
- Tag outcomes (Win / Loss / Breakeven)
- Track win rate, average R:R, total R
- Demo capital simulator with configurable starting balance and risk %

### Data & Caching

- Candle data cached in MongoDB for 1 hour
- Analysis results cached until underlying candle data changes
- Ranged (selection-scoped) queries bypass cache for fresh results
- Fallback to cached data when TwelveData is unavailable

### Numerical Precision

All detection engines use `decimal.Decimal` for calculations. A conversion boundary at the API layer transforms results back to standard floats for JSON serialisation, ensuring zero impact on the frontend.

### Auditing

- HTTP middleware logs every API request duration
- Engine-level timing for algorithm performance
- Events persisted to `audit_logs` collection with 30-day TTL

### Authentication

- Email + password registration with bcrypt-hashed credentials
- JWT bearer tokens issued on login, verified on protected routes (`/api/snapshots`, `/api/auth/me`)
- Frontend gates the dashboard behind an `AuthScreen` until a valid session is established
- Per-user snapshots scoped via `user_id` on every read/write

## Architecture

```
TwelveData API
     │
     ▼
┌─────────────────────────────────┐
│  FastAPI Server                 │
│                                 │
│  routes/candles.py  ──► MongoDB │  (cache OHLC + normalise timestamps)
│                         │       │
│  routes/analysis.py ◄───┘       │  (fetch candles → Decimal → engine)
│  routes/setup.py                │
│  routes/confluence.py           │
│                                 │
│  engine/*.py                    │  (all math in Decimal)
│         │                       │
│         ▼                       │
│  convert_to_float() ──► JSON    │  (API boundary)
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  React Dashboard                │
│                                 │
│  lightweight-charts             │
│  + custom primitives            │
│  + checklist state machine      │
│  + confidence scoring           │
└─────────────────────────────────┘
```

## API Reference

See [API.md](API.md) for the complete endpoint reference.

| Endpoint | Method | Description |
|---|---|---|
| `/api/candles` | GET | Fetch/cache OHLC data from TwelveData |
| `/api/analysis/{component}` | GET | Run a detection engine |
| `/api/setup` | GET | Detect trade setup (Entry/Target/Stop/R:R) |
| `/api/confluence` | GET | Multi-TF confluence zone scoring |
| `/api/snapshots` | GET | List saved snapshots (auth) |
| `/api/snapshots` | POST | Save a new snapshot (auth) |
| `/api/snapshots/{id}` | PATCH | Update snapshot outcome/notes (auth) |
| `/api/snapshots/{id}` | DELETE | Delete a snapshot (auth) |
| `/api/auth/register` | POST | Create an account, returns JWT |
| `/api/auth/login` | POST | Authenticate, returns JWT |
| `/api/auth/me` | GET | Current user profile (auth) |
| `/api/health` | GET | Health check |
