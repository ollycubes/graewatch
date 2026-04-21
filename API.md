# Graewatch API Reference

Base URL: `http://localhost:8000`

All endpoints return JSON. Timestamps use the format `YYYY-MM-DD HH:MM:SS`.

---

## GET /api/candles

Fetch OHLC candlestick data. Returns cached data if fresh (<1 hour), otherwise fetches from TwelveData and caches.

### Parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `pair` | string | ✅ | — | Currency pair, e.g. `EUR/USD` |
| `interval` | string | — | `daily` | Timeframe: `15min`, `1h`, `4h`, `daily`, `weekly` |

### Response

```json
{
  "source": "cache",
  "candle_count": 5000,
  "candles": [
    {
      "timestamp": "2024-01-02 00:00:00",
      "open": 1.1045,
      "high": 1.1062,
      "low": 1.1030,
      "close": 1.1058
    }
  ]
}
```

`source` is either `"cache"` or `"api"` depending on whether the data was served from MongoDB or fetched fresh.

---

## GET /api/analysis/{component}

Run a single detection engine against cached candle data.

### Path Parameters

| Param | Values |
|---|---|
| `component` | `bos`, `fvg`, `orderblocks`, `liquidity`, `wyckoff`, `gann` |

### Query Parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `pair` | string | ✅ | — | Currency pair |
| `interval` | string | — | `daily` | Timeframe |
| `start` | string | — | — | Filter signals after this timestamp (inclusive) |
| `end` | string | — | — | Filter signals before this timestamp (inclusive) |

### Response

```json
{
  "component": "bos",
  "pair": "EUR/USD",
  "interval": "15min",
  "count": 42,
  "signals": [
    {
      "direction": "bullish",
      "price": 1.0845,
      "timestamp": "2024-03-15 12:30:00",
      "swing_ref": 1.0832
    }
  ]
}
```

Signal shape varies by component:

| Component | Key Fields |
|---|---|
| `bos` | `direction`, `price`, `timestamp`, `swing_ref` |
| `fvg` | `direction`, `top`, `bottom`, `timestamp`, `end_timestamp` |
| `orderblocks` | `direction`, `top`, `bottom`, `source_timestamp`, `end_timestamp` |
| `liquidity` | `direction`, `price`, `timestamp`, `pool` |
| `wyckoff` | `phase`, `start_timestamp`, `end_timestamp`, `top`, `bottom` |
| `gann` | `direction`, `high_price`, `low_price`, `start_timestamp`, `end_timestamp` |

### Caching

- Full-range queries are cached in the `analysis` collection, keyed by `(component, pair, interval, candles_fetched_at)`.
- Ranged queries (with `start`/`end`) bypass the cache and run fresh each time.

---

## GET /api/setup

Detect a complete trade setup: Entry POI, Target, Stop Loss, and Risk:Reward ratio using current and higher-timeframe signals.

### Parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `pair` | string | ✅ | — | Currency pair |
| `interval` | string | — | `daily` | Timeframe |
| `start` | string | — | — | Selection start timestamp |
| `end` | string | — | — | Selection end timestamp |

### Response (valid setup)

```json
{
  "pair": "EUR/USD",
  "interval": "15min",
  "valid": true,
  "bias": "bullish",
  "entry_top": 1.08450,
  "entry_bottom": 1.08320,
  "entry_type": "ob",
  "target": 1.09100,
  "target_type": "fvg",
  "stop": 1.08100,
  "risk_reward": 2.73,
  "at_poi": true,
  "current_close": 1.08400
}
```

### Response (no valid setup)

```json
{
  "pair": "EUR/USD",
  "interval": "15min",
  "valid": false,
  "bias": "neutral",
  "current_close": 1.08400
}
```

### How It Works

1. **Bias** — determined from current-TF BOS + HTF BOS + HTF Gann alignment
2. **Entry POI** — the highest-scoring confluence zone from the zone engine
3. **Target** — nearest opposing unmitigated OB/FVG or BOS swing reference
4. **Stop** — placed 0.5 ATR beyond the entry zone boundary
5. **Validation** — geometry check ensures target is beyond entry and stop is beyond entry in the opposite direction

---

## GET /api/confluence

Multi-timeframe confluence zone analysis. Runs detectors for every timeframe from weekly down to the requested interval, then scores zones by cross-TF overlap.

### Parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `pair` | string | ✅ | — | Currency pair |
| `interval` | string | — | `15min` | Base timeframe |
| `start` | string | — | — | Selection start timestamp |
| `end` | string | — | — | Selection end timestamp |

### Response

```json
{
  "pair": "EUR/USD",
  "interval": "15min",
  "bias_chain": {
    "weekly": "bullish",
    "daily": "bullish",
    "4h": "bullish",
    "1h": "bearish",
    "15min": "bullish"
  },
  "zones": [
    {
      "top": 1.08500,
      "bottom": 1.08350,
      "source_type": "ob",
      "score": 8,
      "score_breakdown": {
        "type": 2,
        "proximity": 1,
        "at_poi": 2,
        "liquidity": 1,
        "tf_confluence": 2,
        "cluster": 0
      },
      "tf_matches": ["4h", "1h"],
      "cluster_size": 2,
      "confluence_types": ["ob", "fvg"]
    }
  ]
}
```

---

## POST /api/snapshots

Save a trade setup snapshot.

### Request Body

```json
{
  "pair": "EUR/USD",
  "interval": "15min",
  "selection_start": "2024-03-15 00:00:00",
  "selection_end": "2024-03-20 00:00:00",
  "bias": "bullish",
  "entry_top": 1.08450,
  "entry_bottom": 1.08320,
  "entry_type": "ob",
  "target": 1.09100,
  "target_type": "fvg",
  "stop": 1.08100,
  "risk_reward": 2.73,
  "note": "Clean OB + FVG confluence",
  "screenshot": "data:image/png;base64,..."
}
```

All fields except `pair`, `interval`, `selection_start`, and `selection_end` are optional.

### Response

```json
{ "id": "6620a1b3c1e4f2a3b4c5d6e7" }
```

---

## GET /api/snapshots

List saved snapshots, newest first.

### Parameters

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `pair` | string | — | — | Filter by pair |
| `limit` | int | — | `50` | Max results |

### Response

```json
[
  {
    "id": "6620a1b3c1e4f2a3b4c5d6e7",
    "pair": "EUR/USD",
    "interval": "15min",
    "selection_start": "2024-03-15 00:00:00",
    "selection_end": "2024-03-20 00:00:00",
    "bias": "bullish",
    "entry_top": 1.08450,
    "entry_bottom": 1.08320,
    "outcome": "win",
    "note": "Clean OB + FVG confluence",
    "saved_at": "2024-03-21T14:30:00+00:00"
  }
]
```

---

## PATCH /api/snapshots/{id}

Update a snapshot's outcome or note.

### Request Body

```json
{
  "outcome": "win",
  "note": "Price hit target within 2 hours"
}
```

Both fields are optional; at least one must be provided.

### Response

```json
{ "updated": true }
```

---

## DELETE /api/snapshots/{id}

Delete a snapshot.

### Response

```json
{ "deleted": true }
```

---

## GET /api/health

Health check endpoint.

### Response

```json
{ "status": "ok" }
```

---

## Error Responses

All errors return a JSON object with a `detail` field:

```json
{ "detail": "No candle data found for EUR/USD 15min. Fetch candles first." }
```

| Status | Meaning |
|---|---|
| `404` | Resource not found (no candle data, unknown component, snapshot not found) |
| `422` | Validation error (unsupported interval, invalid snapshot ID) |
| `500` | Server error (database not initialised) |
| `502` | Upstream error (TwelveData API failure) |
