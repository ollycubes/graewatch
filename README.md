# Graewatch

A forex market structure analysis dashboard built around Smart Money Concepts (SMC). It fetches historical candlestick data and runs detection algorithms to identify patterns like Break of Structure and Fair Value Gaps, then displays everything on an interactive chart.

## Project Structure

```
graewatch/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/    # Chart, overlays, selectors, summary panel
│       └── context/       # Dashboard state management
├── server/          # Python backend (FastAPI)
│   ├── routes/      # API endpoints (candles, analysis)
│   └── engine/      # Detection algorithms (BOS, FVG, etc.)
└── .env             # Environment variables (not committed)
```

## Tech Stack

- **Frontend:** React 19, Vite, lightweight-charts (TradingView)
- **Backend:** FastAPI, Motor (async MongoDB driver), HTTPX
- **Database:** MongoDB
- **Data Source:** TwelveData API

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

## Features

- **Candlestick charting** for EUR/USD and GBP/USD across 5 timeframes (15min, 1H, 4H, 1D, 1W)
- **Break of Structure (BOS) detection** — identifies when price breaks past recent swing highs/lows
- **Fair Value Gap (FVG) detection** — highlights imbalances in price action and tracks when they get filled
- **Overlay toggles** — show/hide individual indicators on the chart
- **Summary panel** — lists the most recent signals with prices and timestamps
- **Caching** — candle data is cached in MongoDB for 1 hour to avoid unnecessary API calls, and analysis results are cached until the underlying data changes

## What's Next

The engine is set up to support more analysis components. The following are stubbed out and ready to be implemented:

- Order blocks
- Liquidity sweeps
- Supply/demand zones
- Wyckoff phase detection
- Gann boxes
- Confluence scoring
