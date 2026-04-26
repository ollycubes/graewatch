# Graewatch

A forex chart analysis dashboard built around Smart Money Concepts (SMC). It pulls candlestick data, runs a set of pattern detectors (Break of Structure, Fair Value Gaps, Order Blocks, Liquidity Sweeps, Wyckoff, Gann), scores confluence across timeframes, and presents trade setups on an interactive chart.

## Tech Stack

- **Frontend** — React 19, Vite, [lightweight-charts](https://github.com/tradingview/lightweight-charts)
- **Backend** — FastAPI, Motor (async MongoDB), HTTPX
- **Database** — MongoDB
- **Auth** — JWT + bcrypt
- **Data** — [TwelveData API](https://twelvedata.com/)

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB (local or Atlas)
- A TwelveData API key (free tier works)

### Setup

1. Create a `.env` file in the project root:

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

The frontend runs on `http://localhost:5173` and proxies API calls to the backend on port 8000.

### Tests

```bash
cd server
source .venv/bin/activate
python -m pytest -v
```

Covers detection engines, zone scoring, interval normalisation, decimal precision, auth, and snapshot routes.

### Evaluation

Scripts used for the dissertation evaluation chapter:

```bash
cd server
python eval/run_backtest.py   # walk-forward backtest → JSON + per-trade CSVs
python eval/run_perf.py       # per-engine timing benchmarks
```

Outputs land in `server/eval/results/`.

## Features

### Detection Engines

| Engine | What it does |
|---|---|
| **BOS** | Detects breaks past recent swing highs/lows |
| **FVG** | Highlights price imbalances and tracks fills |
| **Order Blocks** | Marks institutional supply/demand zones |
| **Liquidity** | Flags stop hunts and equal-high/low pools |
| **Wyckoff** | Detects accumulation/distribution phases |
| **Gann** | Renders Gann time/price boxes |
| **Confluence** | Scores zones by cross-timeframe overlap |
| **Setup** | Derives Entry / Target / Stop / R:R |

### Interactive Chart

- TradingView lightweight-charts for candlestick rendering
- 9 custom overlays (BOS, FVG, OB, Gann, Liquidity, Wyckoff, Setup, Confluence, Selection)
- Per-indicator toggles
- Selection tool to scope analysis to a time range

### SMC Checklist

A guided top-down workflow:

1. Pre-flight — pick a pair, confirm data loaded
2. HTF bias — check weekly/daily structure
3. Intermediate structure — 4H / 1H alignment
4. Entry timeframe — find 15-min confluence
5. Setup validation — review entry/target/stop geometry

### Confidence Score (0–100)

Weighted across:
- Bias chain alignment (30)
- Zone quality (25)
- Setup validity & R:R (25)
- Structural factors — POI proximity, liquidity, clustering (20)

### Simulation Journal

- Save setups as snapshots with chart screenshots
- Tag outcomes (Win / Loss / Breakeven)
- Track win rate, avg R:R, total R
- Demo capital simulator with configurable balance and risk %

### Other

- **Caching** — candles cached for 1 hour; analysis cached until candles change; ranged queries bypass cache
- **Precision** — all engines use `decimal.Decimal`, converted to floats only at the API boundary
- **Audit logs** — request and engine timings persisted with a 30-day TTL
- **Auth** — email + password (bcrypt), JWT bearer tokens, per-user snapshot scoping

## Project Structure

```
graewatch/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/     # UI + chart primitives
│       ├── context/        # Dashboard state (useReducer)
│       └── content.json    # Externalised UI strings
└── server/                 # FastAPI backend
    ├── routes/             # API endpoints
    ├── engine/             # Detection algorithms
    ├── utils/              # Precision, audit, auth helpers
    ├── eval/               # Backtest & perf scripts
    └── tests/              # pytest suite
```

## Architecture

```
TwelveData API
     │
     ▼
┌─────────────────────────────────┐
│  FastAPI                        │
│   routes/  ──►  MongoDB cache   │
│   engine/  (Decimal math)       │
│   convert_to_float() ──► JSON   │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  React Dashboard                │
│   lightweight-charts            │
│   + overlays + checklist + UI   │
└─────────────────────────────────┘
```

## API

Full reference in [API.md](API.md).

| Endpoint | Method | Description |
|---|---|---|
| `/api/candles` | GET | Fetch/cache OHLC data |
| `/api/analysis/{component}` | GET | Run a detection engine |
| `/api/setup` | GET | Detect trade setup |
| `/api/confluence` | GET | Multi-TF confluence scoring |
| `/api/snapshots` | GET / POST / PATCH / DELETE | Snapshot CRUD (auth) |
| `/api/auth/register` | POST | Create account, returns JWT |
| `/api/auth/login` | POST | Authenticate, returns JWT |
| `/api/auth/me` | GET | Current user (auth) |
| `/api/health` | GET | Health check |
