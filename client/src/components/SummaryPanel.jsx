// Sidebar panel showing the most recent BOS and FVG signals for the selected pair/interval.
// Filters signals to only show those relevant to the current checklist step.
import { useEffect, useState } from 'react';
import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';

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

const SOURCE_LABEL = { ob: 'OB', fvg: 'FVG', wyckoff: 'WY' };

function ZoneConviction({ zones }) {
  if (!zones || zones.length === 0) return null;
  return (
    <section className="summary-panel__section zone-conviction">
      <h3>Zone Conviction ({zones.length})</h3>
      <ul className="summary-panel__list">
        {zones.map((z, i) => {
          const bd = z.score_breakdown || {};
          const bonuses = [
            bd.at_poi > 0 && 'POI',
            bd.liquidity > 0 && 'Liq',
            z.cluster_size > 1 && `×${z.cluster_size}`,
          ].filter(Boolean);
          return (
            <li key={i} className="zone-conviction__item">
              <span className="zone-conviction__rank">#{i + 1}</span>
              <span className="zone-conviction__badge">{SOURCE_LABEL[z.source_type] ?? z.source_type}</span>
              <span className="zone-conviction__range">
                {z.bottom?.toFixed(4)}–{z.top?.toFixed(4)}
              </span>
              <span className="zone-conviction__score">{z.score}</span>
              {bonuses.length > 0 && (
                <span className="zone-conviction__flags">{bonuses.join(' · ')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SummaryPanel({ pair, interval, selection }) {
  const { state } = useDashboard();
  const [summary, setSummary] = useState({ bos: [], fvg: [], gann: [], ob: [], liq: [] });
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentStepDef = CHECKLIST_STEPS[state.checklist.currentStep];
  const overlays = currentStepDef?.overlays || {};

  useEffect(() => {
    // AbortController cancels in-flight requests when pair/interval changes
    // before the previous fetch completes, preventing stale data from rendering.
    const abortController = new AbortController();

    async function fetchSummary() {
      setLoading(true);
      setError('');

      // Build range query suffix when a selection is active
      let rangeParams = '';
      if (selection) {
        rangeParams = `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
      }

      try {
        const fetchList = [
          fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }),
          fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }),
          fetch(`/api/analysis/gann?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }),
          fetch(`/api/analysis/orderblocks?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }),
          fetch(`/api/analysis/liquidity?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }),
        ];
        if (selection) {
          fetchList.push(fetch(`/api/zones?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }));
        }

        const results = await Promise.allSettled(fetchList);
        const [bosRes, fvgRes, gannRes, obRes, liqRes] = results;

        if (
          bosRes.status !== 'fulfilled' || !bosRes.value.ok ||
          fvgRes.status !== 'fulfilled' || !fvgRes.value.ok ||
          gannRes.status !== 'fulfilled' || !gannRes.value.ok ||
          obRes.status !== 'fulfilled' || !obRes.value.ok ||
          liqRes.status !== 'fulfilled' || !liqRes.value.ok
        ) {
          throw new Error('Unable to load summary signals');
        }

        const [bos, fvg, gann, ob, liq] = await Promise.all([
          bosRes.value.json(), fvgRes.value.json(), gannRes.value.json(),
          obRes.value.json(), liqRes.value.json(),
        ]);
        setSummary({
          bos: bos.signals || [],
          fvg: fvg.signals || [],
          gann: gann.signals || [],
          ob: ob.signals || [],
          liq: liq.signals || [],
        });

        const zonesResult = results[5];
        if (zonesResult?.status === 'fulfilled' && zonesResult.value.ok) {
          const zonesData = await zonesResult.value.json();
          setZones(zonesData.zones || []);
        } else {
          setZones([]);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError('Signal summary unavailable right now.');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          if (!selection) setZones([]);
        }
      }
    }

    fetchSummary();

    return () => {
      abortController.abort();
    };
  }, [pair, interval, selection]);

  const recentBos = [...summary.bos].reverse().slice(0, MAX_SIGNALS);
  const recentFvg = [...summary.fvg].reverse().slice(0, MAX_SIGNALS);
  const recentGann = [...summary.gann].reverse().slice(0, MAX_SIGNALS);
  const recentOB = [...summary.ob].reverse().slice(0, MAX_SIGNALS);
  const recentLiq = [...summary.liq].reverse().slice(0, MAX_SIGNALS);

  return (
    <aside className="summary-panel" aria-live="polite">
      <h2>
        Summary
        <span className="summary-panel__step-tag">
          Step {state.checklist.currentStep} · {currentStepDef?.title}
        </span>
      </h2>
      <p className="summary-panel__meta">
        {pair} • {interval}
      </p>

      {loading && <div className="spinner" />}
      {error && <p className="summary-panel__error">{error}</p>}

      {!loading && !error && (
        <>
          {selection && <ZoneConviction zones={zones} />}
          {overlays.bos && (
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
          )}

          {overlays.fvg && (
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
          )}

          {overlays.gann && (
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
          )}

          {overlays.orderblocks && (
            <section className="summary-panel__section">
              <h3>OB ({summary.ob.length})</h3>
              {recentOB.length === 0 ? (
                <p className="summary-panel__count">No order blocks</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentOB.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? 'Bullish' : 'Bearish'} OB{' '}
                      {formatPrice(s.bottom)}–{formatPrice(s.top)}
                      {s.end_timestamp ? ' (mitigated)' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {overlays.liquidity && (
            <section className="summary-panel__section">
              <h3>Liquidity ({summary.liq.length})</h3>
              {recentLiq.length === 0 ? (
                <p className="summary-panel__count">No sweeps</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentLiq.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? 'Bullish' : 'Bearish'} sweep at{' '}
                      {formatPrice(s.price)}
                      {s.pool ? ' (pool)' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Show a hint when no overlays are active (e.g. Step 0) */}
          {!Object.values(overlays).some(Boolean) && (
            <p className="summary-panel__count" style={{ fontStyle: 'italic' }}>
              Complete pre-flight checks to begin analysis
            </p>
          )}
        </>
      )}
    </aside>
  );
}

export default SummaryPanel;
