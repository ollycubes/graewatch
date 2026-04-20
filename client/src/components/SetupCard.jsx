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

const TYPE_LABELS = { ob: 'OB', fvg: 'FVG', swing: 'Swing', wyckoff: 'WY' };

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


const TF_SHORT = { weekly: 'W', daily: 'D', '4h': '4H', '1h': '1H', '15min': '15M', gann: 'G' };
const BIAS_ARROW = { bullish: '▲', bearish: '▼', neutral: '—' };

function BiasChain({ chain }) {
  if (!chain || Object.keys(chain).length === 0) return null;
  const order = ['weekly', 'daily', '4h', '1h', '15min'];
  const entries = order.filter((tf) => chain[tf]);
  return (
    <div className="bias-chain">
      {entries.map((tf) => (
        <span key={tf} className={`bias-chain__item bias-chain__item--${chain[tf]}`}>
          {TF_SHORT[tf]} {BIAS_ARROW[chain[tf]] ?? chain[tf]}
        </span>
      ))}
    </div>
  );
}

function SetupCard({ pair, interval, selection, onClearSelection, onSetup }) {
  const [setup, setSetup] = useState(null);
  const [topZone, setTopZone] = useState(null);
  const [biasChain, setBiasChain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selection) {
      setSetup(null);
      setTopZone(null);
      setBiasChain(null);
      setError('');
      setLoading(false);
      if (onSetup) onSetup(null);
      return;
    }

    const ctrl = new AbortController();

    async function fetchAll() {
      setLoading(true);
      setError('');
      const range = `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
      // We explicitly fetch the 15min setup to ensure the granular entry logic
      // is displayed consistently across all higher timeframes.
      const base = `pair=${pair}&interval=15min${range}`;

      try {
        const [setupRes, zonesRes] = await Promise.allSettled([
          fetch(`/api/setup?${base}`, { signal: ctrl.signal }),
          fetch(`/api/confluence?${base}`, { signal: ctrl.signal }),
        ]);

        if (setupRes.status === 'fulfilled' && setupRes.value.ok) {
          const data = await setupRes.value.json();
          setSetup(data);
          if (onSetup) onSetup(data);
        } else {
          throw new Error('Setup fetch failed');
        }

        if (zonesRes.status === 'fulfilled' && zonesRes.value.ok) {
          const data = await zonesRes.value.json();
          setTopZone((data.zones || [])[0] ?? null);
          setBiasChain(data.bias_chain ?? null);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') setError('Setup unavailable');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }

    fetchAll();
    return () => ctrl.abort();
  }, [pair, interval, selection, onSetup]);

  // Entry display: prefer #1 scored zone, fall back to setup's entry
  const entryTop = topZone ? topZone.top : setup?.entry_top;
  const entryBottom = topZone ? topZone.bottom : setup?.entry_bottom;
  const entryType = topZone ? topZone.source_type : setup?.entry_type;
  const atPoi = topZone
    ? topZone.score_breakdown?.at_poi > 0
    : setup?.at_poi;

  return (
    <div className="setup-card">
      {/* Left: pair + bias + bias chain */}
      <div className="setup-card__meta">
        <div className="setup-card__meta-top">
          <span className="setup-card__pair">{pair} · {interval.toUpperCase()}</span>
          {setup && <BiasBadge bias={setup.bias} />}
          {!setup && !loading && !error && (
            <span className="setup-card__hint">Draw a selection to analyse a setup</span>
          )}
          {loading && <span className="setup-card__hint">Analysing…</span>}
          {error && <span className="setup-card__error">{error}</span>}
        </div>
        {biasChain && <BiasChain chain={biasChain} />}
      </div>

      {/* Divider */}
      {setup && setup.valid && <div className="setup-card__divider" />}

      {/* Centre: entry / target / stop */}
      {setup && setup.valid && (
        <div className="setup-card__levels">
          <div className={`setup-card__level${atPoi ? ' setup-card__level--poi' : ''}`}>
            <span className="setup-card__level-label">ENTRY</span>
            <span className="setup-card__level-value">
              {formatPrice(entryBottom)} – {formatPrice(entryTop)}
            </span>
            <div className="setup-card__level-tags">
              {entryType && <span className="setup-card__tag">{TYPE_LABELS[entryType]}</span>}
              {topZone?.score != null && (
                <span className="setup-card__score">{topZone.score}</span>
              )}
            </div>
          </div>

          <div className="setup-card__level-sep" />

          <div className="setup-card__level">
            <span className="setup-card__level-label">TARGET</span>
            <span className="setup-card__level-value">{formatPrice(setup.target)}</span>
            {setup.target_type && (
              <span className="setup-card__tag">{TYPE_LABELS[setup.target_type]}</span>
            )}
          </div>

          <div className="setup-card__level-sep" />

          <div className="setup-card__level">
            <span className="setup-card__level-label">STOP</span>
            <span className="setup-card__level-value">{formatPrice(setup.stop)}</span>
          </div>
        </div>
      )}

      {setup && !setup.valid && (
        <span className="setup-card__no-setup">No setup found at this timeframe</span>
      )}

      {/* Divider */}
      {setup && setup.valid && <div className="setup-card__divider" />}

      {/* R:R */}
      {setup && setup.valid && (
        <div className="setup-card__rr">
          <span className="setup-card__rr-label">R : R</span>
          <span className="setup-card__rr-value">1 : {setup.risk_reward}</span>
        </div>
      )}

      {/* Right: selection dates + clear */}
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
