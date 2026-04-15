/**
 * SMC trade setup card.
 *
 * Replaces the old weighted-confidence PredictionCard with a concrete
 * structural setup: Entry POI · Target · Stop · R:R ratio.
 *
 * Only fetches when a selection is active — without a selection there
 * is no scoped context to evaluate a setup against.
 */
import { useEffect, useState } from 'react';

function formatPrice(p) {
  return typeof p === 'number' ? p.toFixed(5) : '—';
}

function formatDate(ts) {
  if (ts == null) return '';
  const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

const TYPE_LABELS = { ob: 'OB', fvg: 'FVG', swing: 'Swing' };

function BiasBadge({ bias }) {
  const cls =
    bias === 'bullish'
      ? 'setup-card__bias--bullish'
      : bias === 'bearish'
        ? 'setup-card__bias--bearish'
        : 'setup-card__bias--neutral';
  const label =
    bias === 'bullish' ? '▲ Bullish' : bias === 'bearish' ? '▼ Bearish' : '— Neutral';
  return <span className={`setup-card__bias ${cls}`}>{label}</span>;
}

function SetupRow({ label, value, tag, highlight }) {
  return (
    <div className={`setup-card__row${highlight ? ' setup-card__row--highlight' : ''}`}>
      <span className="setup-card__row-label">{label}</span>
      <span className="setup-card__row-value">
        {value}
        {tag && <span className="setup-card__tag">{tag}</span>}
      </span>
    </div>
  );
}

function SetupCard({ pair, interval, selection, onClearSelection, onSetup }) {
  const [setup, setSetup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selection) {
      setSetup(null);
      setError('');
      setLoading(false);
      if (onSetup) onSetup(null);
      return;
    }

    const ctrl = new AbortController();

    async function fetchSetup() {
      setLoading(true);
      setError('');
      try {
        const url =
          `/api/setup?pair=${pair}&interval=${interval}` +
          `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Setup fetch failed: ${res.status}`);
        const data = await res.json();
        setSetup(data);
        if (onSetup) onSetup(data);
      } catch (err) {
        if (err?.name !== 'AbortError') setError('Setup unavailable');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }

    fetchSetup();
    return () => ctrl.abort();
  }, [pair, interval, selection, onSetup]);

  // ── Shell (always rendered so the bar never collapses) ──────────────────
  return (
    <div className="setup-card">
      {/* Left: meta + bias */}
      <div className="setup-card__left">
        <span className="setup-card__pair">{pair} · {interval.toUpperCase()}</span>
        {setup && <BiasBadge bias={setup.bias} />}
        {!setup && !loading && !error && (
          <span className="setup-card__hint">Draw a selection to analyse a setup</span>
        )}
        {loading && <span className="setup-card__hint">Analysing…</span>}
        {error && <span className="setup-card__error">{error}</span>}
      </div>

      {/* Centre: setup levels */}
      {setup && setup.valid && (
        <div className="setup-card__levels">
          <SetupRow
            label="Entry"
            value={`${formatPrice(setup.entry_bottom)} – ${formatPrice(setup.entry_top)}`}
            tag={TYPE_LABELS[setup.entry_type]}
            highlight={setup.at_poi}
          />
          <SetupRow
            label="Target"
            value={formatPrice(setup.target)}
            tag={TYPE_LABELS[setup.target_type]}
          />
          <SetupRow label="Stop" value={formatPrice(setup.stop)} />
        </div>
      )}

      {setup && setup.valid && (
        <div className="setup-card__rr">
          <span className="setup-card__rr-label">R : R</span>
          <span className="setup-card__rr-value">1 : {setup.risk_reward}</span>
        </div>
      )}

      {setup && !setup.valid && (
        <span className="setup-card__no-setup">No setup found at this timeframe</span>
      )}

      {/* Right: selection badge + clear */}
      {selection && (
        <div className="setup-card__selection">
          <span className="setup-card__selection-dates">
            {formatDate(selection.start)} → {formatDate(selection.end)}
          </span>
          <button
            className="setup-card__clear"
            onClick={onClearSelection}
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default SetupCard;
