# Project Log

Please regularly update this file to record your project progress. You should be updating the project log _at least_ once a fortnight.


# Session 1:
- Project Setup
- Setup code formatting and linting with eslint and prettier
- Removed boilerplate bloat


# Session 2:
- Setup React client and FastAPI server with a health check endpoint
- Configured code formatting and linting (ESLint, Prettier) for ease of development
- Removed remaining boilerplate


# Session 3:
- Created the backend entrypoint (`main.py`) connecting to MongoDB and configuring CORS
- Built the candles route (`/api/candles`) to fetch OHLC data from Twelve Data API
- Wired candles route into `main.py`
- Implemented candlestick data caching in MongoDB with a 1-hour TTL
- Installed Lightweight Charts library for frontend charting


# Session 4:
- Built interactive candlestick chart visualisation with pair and interval selectors
- Minor chart colour adjustments
- Added BOS (Break of Structure) detection engine with swing high/low identification
- Changed BOS indicator display from arrows to horizontal lines


# Session 5:
- Implemented FVG (Fair Value Gap) detection logic and display overlays on the chart
- Added context window selection box for indicators (later removed due to issues)
- Styling and colour changes to the dashboard view
- Fixed chart switching overwrite bug
- Styled BOS text labels on chart


# Session 6:
- Restructured project layout and aligned with documentation
- Fixed ESLint and formatter configuration issues
- Limited supported pairs to EUR/USD and GBP/USD
- Frontend tweaks including individual indicator markings and annotations
- Added toggle switches for BOS and FVG overlays
- Built summary panel listing recent BOS and FVG signals
- Analysis results caching in MongoDB with stale cache detection
- Created shared interval normalisation helpers (`routes/intervals.py`)
- Added analysis route (`/api/analysis/{component}`) with modular engine components
- VSCode linting configuration fixes


# Session 7:
- Added Gann Box detection engine (`engine/gann.py`) pairing swing highs/lows into boxes
- Built `GannBoxesPrimitive.js` chart overlay — grey shaded rectangle with dashed midline at the 50% premium/discount level
- Implemented HTF (higher timeframe) bias filtering for top-down analysis: signals on the current timeframe are only shown if they align with the bias one timeframe above
- HTF bias is computed by combining the most recent BOS direction and Gann box premium/discount position from the higher timeframe
- HTF mapping: 15min→1H, 1H→4H, 4H→Daily, Daily→Weekly, Weekly→no filter
- Added `HTF_MAP` constant to `dashboardStore.js`


# Session 8:
- Implemented Order Block (OB) detection engine (`engine/orderblocks.py`)
  - Bullish OB: last bearish candle before a bullish BOS — zone from candle open to top wick
  - Bearish OB: last bullish candle before a bearish BOS — zone from candle open to bottom wick
  - OB zones extend forward until mitigated (price re-enters the zone)
- Built `OBBoxesPrimitive.js` chart overlay — teal/red shaded rectangles with left-border accent and "OB" label
- Wired OBs into chart, overlay toggles, summary panel, and HTF bias filtering
- Added `orderblocks` toggle to dashboard state


# Session 9:
- Built confluence-based prediction engine (`engine/prediction.py`) combining BOS, FVG, Gann, OB, and HTF bias into a directional forecast with confidence score and target price range
- Added `/api/prediction` route with optional `start`/`end` timestamp filtering
- Built `PredictionCard.jsx` — displays direction arrow, semicircle confidence gauge, target high/low price range, and signal confluence chips
- Built `PredictionZonePrimitive.js` — draws a projected price range zone extending to the right of the last candle on the chart


# Session 10:
- Implemented Liquidity Sweep detection engine (`engine/liquidity.py`)
  - Detects swing high/low sweeps: wick beyond a level, close back inside
  - Identifies equal highs/lows clusters (liquidity pools) using ATR-based tolerance
  - Pool sweeps flagged with `pool: true` for stronger signal weighting
- Built `LiquidityLinesPrimitive.js` — horizontal dashed lines from the source swing to the sweep candle; pool sweeps shown with thicker line and "liq pool" label
- Added liquidity sweep vote to the prediction engine (10% weight); rebalanced all weights to sum to 1.0
- Added liquidity overlay toggle and summary panel section
- Added `recent_liq` signal chip to `PredictionCard`


# Session 11:
- Replaced flat overlay toggle controls with a step-by-step SMC checklist sidebar (`ChecklistSidebar.jsx`)
- Defined 5 checklist steps in `dashboardStore.js` covering the full top-down analysis workflow: 1W momentum, 1D BOS/OBs, 4H confluence/Gann, 1H POI confirmation, 15M entry trigger
- Each checklist step automatically sets the chart interval and enables the relevant overlays — overlays accumulate as steps are completed
- Added selection box tool (`SelectionBoxPrimitive.js`) allowing the user to highlight a specific candle range on the chart
- Selection range is stored in global state and passed to all analysis and prediction API calls via `start`/`end` query params
- Scoped prediction results and summary panel signals to the selected range when active
- Moved prediction card above the chart as a persistent horizontal bar (always visible)
- Added selection badge to prediction card showing the active date range with a one-click clear button
- Chart price axis updated to 5 decimal places (`precision: 5`) for forex pairs


# Session 12:
- Project cleanup and organisation
  - Deleted unused `FAQ.md` (university CMS template)
  - Deleted unused `OverlayToggles.jsx` (superseded by the checklist sidebar)
  - Deleted empty `server/routes/__init__.py`
  - Removed `zones` and `wyckoff` stub engines from the `COMPONENTS` registry (stub files retained for future implementation)
  - Moved all 7 chart primitive files into `client/src/components/primitives/` subfolder
  - Created `.env.example` documenting required environment variables


# Session 13:
- Implemented Wyckoff analysis engine, fleshing out the previously stubbed component
- Built initial unit test suite covering both the frontend (React components) and backend (FastAPI routes/engines)
- Remodelled the prediction engine output to better reflect confluence and confidence
- Fixed bug where indicators were rendered even when no selection range had been made
- Adjusted order block colours for clearer bullish/bearish distinction


# Session 14:
- Reworked zone detection logic and unified the "zones" and "setup" flows into a single area
- Refined order block mitigation step handling
- Locked SMC checklist steps until a selection range is made (prevents premature analysis)
- Fixed chart flicker, reset button bug, and chart pair/interval selector issues
- General bug fixes around zone updaters and chart redrawing


# Session 15:
- Built the **save snapshot** feature — users can capture and store their current chart state with overlays for later review
- Added screenshot/PNG generation for snapshots with toggleable open/close display
- Introduced **simulation history** view to browse past snapshots
- Fixed entry zone rendering, box persistence across reloads, and incorrect section selection bugs
- Updated prediction card layout and confidence level display
- Fixed lingering liquidity sweep rendering issues
- Corrected the order block drawing method


# Session 16:
- Implemented **user accounts and secure authentication** (registration, login, session management)
- Added security hardening pass (input validation, auth middleware, etc.)
- Built audit trail / logging system for dissertation debugging and traceability
- Implemented **data persistence** so user snapshots, history, and selections survive across sessions
- Migrated all tutorial / static UI copy into a centralised JSON file consumed by React components
- Addressed non-functional requirements: input normalisation, tutorial onboarding flow
- Removed dead code uncovered during the refactor


# Session 17:
- Major test expansion: added engine test cases for adapters, scoring, clusters, and signals
- Added route snapshot, interval, and precision utility tests
- Finalised the full test suite and resolved outstanding test failures
- Large-scale code cleanup and review pass across the codebase
- Ran linter and formatter to standardise code structure project-wide


# Session 18:
- Built evaluation metric generation scripts for measuring prediction engine performance
- Added evaluation harness scripts for batch-running analysis across historical data
- Updated README documentation ahead of project submission
