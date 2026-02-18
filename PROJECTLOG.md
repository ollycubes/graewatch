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
