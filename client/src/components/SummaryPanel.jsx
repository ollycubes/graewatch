import { useEffect, useState } from 'react';

function SummaryPanel({ pair, interval }) {
  const [summary, setSummary] = useState({ bos: [], fvg: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchSummary() {
      setLoading(true);
      setError('');

      try {
        const [bosRes, fvgRes] = await Promise.all([
          fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}`, {
            signal: abortController.signal,
          }),
          fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}`, {
            signal: abortController.signal,
          }),
        ]);

        if (!bosRes.ok || !fvgRes.ok) {
          throw new Error('Unable to load summary signals');
        }

        const [bos, fvg] = await Promise.all([bosRes.json(), fvgRes.json()]);
        setSummary({
          bos: bos.signals || [],
          fvg: fvg.signals || [],
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

  return (
    <aside className="summary-panel" aria-live="polite">
      <h2>Summary</h2>
      <p className="summary-panel__meta">{pair} • {interval}</p>

      {loading && <p className="summary-panel__state">Loading signals...</p>}
      {error && <p className="summary-panel__error">{error}</p>}

      {!loading && !error && (
        <>
          <section className="summary-panel__section">
            <h3>BOS</h3>
            <p className="summary-panel__count">{summary.bos.length} signals</p>
          </section>

          <section className="summary-panel__section">
            <h3>FVG</h3>
            <p className="summary-panel__count">{summary.fvg.length} zones</p>
          </section>
        </>
      )}
    </aside>
  );
}

export default SummaryPanel;
