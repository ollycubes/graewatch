// Sidebar panel showing the most recent BOS and FVG signals for the selected pair/interval.
// Fetches independently of CandlestickChart so the sidebar stays in sync even if
// the chart is still loading.
import { useEffect, useState } from 'react';

// Cap the list length so the sidebar doesn't grow unbounded on high-frequency intervals.
const MAX_SIGNALS = 20;

// Accepts a unix timestamp in seconds or ISO string and returns YYYY-MM-DD.
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toISOString().slice(0, 10);
}

function formatPrice(p) {
  return typeof p === 'number' ? p.toFixed(4) : String(p);
}

function SummaryPanel({ pair, interval }) {
  const [summary, setSummary] = useState({ bos: [], fvg: [], gann: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // AbortController cancels in-flight requests when pair/interval changes
    // before the previous fetch completes, preventing stale data from rendering.
    const abortController = new AbortController();

    async function fetchSummary() {
      setLoading(true);
      setError('');

      try {
        const [bosRes, fvgRes, gannRes] = await Promise.all([
          fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}`, {
            signal: abortController.signal,
          }),
          fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}`, {
            signal: abortController.signal,
          }),
          fetch(`/api/analysis/gann?pair=${pair}&interval=${interval}`, {
            signal: abortController.signal,
          }),
        ]);

        if (!bosRes.ok || !fvgRes.ok || !gannRes.ok) {
          throw new Error('Unable to load summary signals');
        }

        const [bos, fvg, gann] = await Promise.all([bosRes.json(), fvgRes.json(), gannRes.json()]);
        setSummary({
          bos: bos.signals || [],
          fvg: fvg.signals || [],
          gann: gann.signals || [],
        });
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError('Signal summary unavailable right now.');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      abortController.abort();
    };
  }, [pair, interval]);

  const recentBos = [...summary.bos].reverse().slice(0, MAX_SIGNALS);
  const recentFvg = [...summary.fvg].reverse().slice(0, MAX_SIGNALS);
  const recentGann = [...summary.gann].reverse().slice(0, MAX_SIGNALS);

  return (
    <aside className="summary-panel" aria-live="polite">
      <h2>Summary</h2>
      <p className="summary-panel__meta">
        {pair} • {interval}
      </p>

      {loading && <div className="spinner" />}
      {error && <p className="summary-panel__error">{error}</p>}

      {!loading && !error && (
        <>
          <section className="summary-panel__section">
            <h3>BOS ({summary.bos.length})</h3>
            {recentBos.length === 0 ? (
              <p className="summary-panel__count">No signals</p>
            ) : (
              <ul className="summary-panel__list">
                {recentBos.map((s, i) => (
                  <li key={i}>
                    {s.direction === 'bullish' ? 'Bullish' : 'Bearish'} break at{' '}
                    {formatPrice(s.price)} on {formatDate(s.timestamp)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="summary-panel__section">
            <h3>FVG ({summary.fvg.length})</h3>
            {recentFvg.length === 0 ? (
              <p className="summary-panel__count">No zones</p>
            ) : (
              <ul className="summary-panel__list">
                {recentFvg.map((s, i) => (
                  <li key={i}>
                    {s.direction === 'bullish' ? 'Bullish' : 'Bearish'} gap between{' '}
                    {formatPrice(s.bottom)}–{formatPrice(s.top)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="summary-panel__section">
            <h3>Gann ({summary.gann.length})</h3>
            {recentGann.length === 0 ? (
              <p className="summary-panel__count">No boxes</p>
            ) : (
              <ul className="summary-panel__list">
                {recentGann.map((s, i) => (
                  <li key={i}>
                    {s.direction === 'bullish' ? 'Bullish' : 'Bearish'} box{' '}
                    {formatPrice(s.low_price)}–{formatPrice(s.high_price)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

export default SummaryPanel;
