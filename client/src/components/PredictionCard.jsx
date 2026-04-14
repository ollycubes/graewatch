// Prediction forecast card — displays direction, confidence gauge,
// target price range, and signal breakdown for the next-period prediction.
import { useEffect, useState } from 'react';

function formatSelectionDate(ts) {
  if (ts == null) return '';
  // ts is a unix timestamp in seconds
  const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatPrice(p) {
  return typeof p === 'number' ? p.toFixed(4) : String(p);
}

// Maps signal keys to human-readable labels.
const SIGNAL_LABELS = {
  htf_bos: 'HTF Trend',
  current_bos: 'BOS',
  nearest_fvg: 'FVG Zone',
  nearest_ob: 'OB Zone',
  gann_position: 'Gann',
  recent_liq: 'Liquidity',
};

function SignalChip({ label, value }) {
  if (!value) {
    return (
      <span className="prediction-card__chip prediction-card__chip--neutral">
        {label}: —
      </span>
    );
  }

  const dir = typeof value === 'object' ? value.direction : value;
  const cls =
    dir === 'bullish'
      ? 'prediction-card__chip--bullish'
      : dir === 'bearish'
        ? 'prediction-card__chip--bearish'
        : 'prediction-card__chip--neutral';

  return (
    <span className={`prediction-card__chip ${cls}`}>
      {label}: {dir === 'bullish' ? '▲' : dir === 'bearish' ? '▼' : dir}
    </span>
  );
}

function ConfidenceGauge({ confidence, direction }) {
  // SVG semicircle gauge, 0-100%
  const radius = 38;
  const circumference = Math.PI * radius; // half-circle
  const offset = circumference - (confidence / 100) * circumference;
  const color =
    direction === 'bullish'
      ? '#26a69a'
      : direction === 'bearish'
        ? '#ef5350'
        : '#999';

  return (
    <div className="prediction-card__gauge">
      <svg viewBox="0 0 100 55" className="prediction-card__gauge-svg">
        {/* Background track */}
        <path
          d="M 10 50 A 38 38 0 0 1 90 50"
          fill="none"
          stroke="rgba(150,126,118,0.2)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 10 50 A 38 38 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <span className="prediction-card__gauge-value" style={{ color }}>
        {confidence}%
      </span>
    </div>
  );
}

function PredictionCard({ pair, interval, selection, onClearSelection }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchPrediction() {
      setLoading(true);
      setError('');
      try {
        let url = `/api/prediction?pair=${pair}&interval=${interval}`;
        if (selection) {
          url += `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
        }
        const res = await fetch(url, { signal: abortController.signal });
        if (!res.ok) throw new Error(`Prediction failed: ${res.status}`);
        const data = await res.json();
        setPrediction(data);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError('Prediction unavailable');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchPrediction();
    return () => abortController.abort();
  }, [pair, interval, selection]);

  if (loading) {
    return (
      <div className="prediction-card">
        <h2>Prediction</h2>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="prediction-card">
        <h2>Prediction</h2>
        <p className="prediction-card__error">{error || 'No data yet'}</p>
      </div>
    );
  }

  const dirLabel =
    prediction.direction === 'bullish'
      ? 'Bullish'
      : prediction.direction === 'bearish'
        ? 'Bearish'
        : 'Neutral';

  const dirArrow =
    prediction.direction === 'bullish'
      ? '▲'
      : prediction.direction === 'bearish'
        ? '▼'
        : '—';

  const dirClass = `prediction-card__direction--${prediction.direction}`;

  return (
    <div className="prediction-card">
      <h2>Prediction</h2>
      <p className="prediction-card__meta">{pair} • {interval}</p>

      {selection && (
        <div className="prediction-card__selection-badge">
          <span>
            {formatSelectionDate(selection.start)} → {formatSelectionDate(selection.end)}
          </span>
          <button
            className="prediction-card__clear-btn"
            onClick={onClearSelection}
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      <div className="prediction-card__hero">
        <div className="prediction-card__dir-row">
          <span className={`prediction-card__direction ${dirClass}`}>
            <span className="prediction-card__arrow">{dirArrow}</span>
            {dirLabel}
          </span>

          <ConfidenceGauge
            confidence={prediction.confidence}
            direction={prediction.direction}
          />
        </div>

        {prediction.direction !== 'neutral' && (
          <div className="prediction-card__range">
            <div className="prediction-card__range-row">
              <span className="prediction-card__range-label">Target High</span>
              <span className="prediction-card__range-value">
                {formatPrice(prediction.target_high)}
              </span>
            </div>
            <div className="prediction-card__range-row">
              <span className="prediction-card__range-label">Current</span>
              <span className="prediction-card__range-value prediction-card__range-value--current">
                {formatPrice(prediction.current_close)}
              </span>
            </div>
            <div className="prediction-card__range-row">
              <span className="prediction-card__range-label">Target Low</span>
              <span className="prediction-card__range-value">
                {formatPrice(prediction.target_low)}
              </span>
            </div>
          </div>
        )}

        <div className="prediction-card__signals">
          <h3>Signal Confluence</h3>
          <div className="prediction-card__chips">
            {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
              <SignalChip
                key={key}
                label={label}
                value={prediction.signals?.[key]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PredictionCard;
