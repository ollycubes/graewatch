// Sidebar panel showing the most recent BOS and FVG signals for the selected pair/interval.
// Filters signals to only show those relevant to the current checklist step.
import { useEffect, useState } from 'react';
import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';
import content from '../content.json';

const { summary: S, maps } = content;

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

const SOURCE_LABEL = maps.sourceLabel;
const TF_SHORT = maps.tfShort;
const BIAS_ARROW = maps.biasArrow;

function BiasChainBar({ chain }) {
  if (!chain) return null;
  const order = ['weekly', 'daily', '4h', '1h', '15min'];
  const entries = order.filter((tf) => chain[tf]);
  return (
    <div className="bias-chain bias-chain--panel">
      {entries.map((tf) => (
        <span key={tf} className={`bias-chain__item bias-chain__item--${chain[tf]}`}>
          {TF_SHORT[tf]} {BIAS_ARROW[chain[tf]] ?? chain[tf]}
        </span>
      ))}
    </div>
  );
}

function ZoneConviction({ zones, biasChain }) {
  if ((!zones || zones.length === 0) && !biasChain) return null;
  return (
    <section className="summary-panel__section zone-conviction">
      <h3>{S.zoneConviction} {zones?.length > 0 && `(${zones.length})`}</h3>
      <BiasChainBar chain={biasChain} />
      {(!zones || zones.length === 0) ? (
        <p className="summary-panel__count">{S.noZones}</p>
      ) : (
        <ul className="summary-panel__list">
          {zones.map((z, i) => {
            const bd = z.score_breakdown || {};
            const tfMatches = z.tf_matches || [];
            const flags = [
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
                <span className="zone-conviction__tfs">
                  {tfMatches.map((tf) => (
                    <span key={tf} className="zone-conviction__tf-badge">{TF_SHORT[tf] ?? tf}</span>
                  ))}
                </span>
                {flags.length > 0 && (
                  <span className="zone-conviction__flags">{flags.join(' · ')}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SummaryPanel({ pair, interval, selection }) {
  const { state } = useDashboard();
  const [summary, setSummary] = useState({ bos: [], fvg: [], gann: [], ob: [], liq: [] });
  const [zones, setZones] = useState([]);
  const [biasChain, setBiasChain] = useState(null);
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
          fetchList.push(fetch(`/api/confluence?pair=${pair}&interval=${interval}${rangeParams}`, { signal: abortController.signal }));
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
          setBiasChain(zonesData.bias_chain ?? null);
        } else {
          setZones([]);
          setBiasChain(null);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError(S.error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          if (!selection) { setZones([]); setBiasChain(null); }
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
        {S.title}
        <span className="summary-panel__step-tag">
          {S.stepPrefix} {state.checklist.currentStep} · {currentStepDef?.title}
        </span>
      </h2>
      <p className="summary-panel__meta">
        {pair} • {interval}
      </p>

      {loading && <div className="spinner" />}
      {error && <p className="summary-panel__error">{error}</p>}

      {!loading && !error && (
        <>
          {selection && <ZoneConviction zones={zones} biasChain={biasChain} />}
          {overlays.bos && (
            <section className="summary-panel__section">
              <h3>{S.sections.bos} ({summary.bos.length})</h3>
              {recentBos.length === 0 ? (
                <p className="summary-panel__count">{S.empty.bos}</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentBos.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? S.signals.bullish : S.signals.bearish}{S.signals.breakAt}{' '}
                      {formatPrice(s.price)}{S.signals.on}{formatDate(s.timestamp)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {overlays.fvg && (
            <section className="summary-panel__section">
              <h3>{S.sections.fvg} ({summary.fvg.length})</h3>
              {recentFvg.length === 0 ? (
                <p className="summary-panel__count">{S.empty.fvg}</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentFvg.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? S.signals.bullish : S.signals.bearish}{S.signals.gapBetween}{' '}
                      {formatPrice(s.bottom)}–{formatPrice(s.top)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {overlays.gann && (
            <section className="summary-panel__section">
              <h3>{S.sections.gann} ({summary.gann.length})</h3>
              {recentGann.length === 0 ? (
                <p className="summary-panel__count">{S.empty.gann}</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentGann.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? S.signals.bullish : S.signals.bearish}{S.signals.box}{' '}
                      {formatPrice(s.low_price)}–{formatPrice(s.high_price)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {overlays.orderblocks && (
            <section className="summary-panel__section">
              <h3>{S.sections.ob} ({summary.ob.length})</h3>
              {recentOB.length === 0 ? (
                <p className="summary-panel__count">{S.empty.ob}</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentOB.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? S.signals.bullish : S.signals.bearish}{S.signals.ob}{' '}
                      {formatPrice(s.bottom)}–{formatPrice(s.top)}
                      {s.end_timestamp ? S.signals.mitigated : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {overlays.liquidity && (
            <section className="summary-panel__section">
              <h3>{S.sections.liquidity} ({summary.liq.length})</h3>
              {recentLiq.length === 0 ? (
                <p className="summary-panel__count">{S.empty.liq}</p>
              ) : (
                <ul className="summary-panel__list">
                  {recentLiq.map((s, i) => (
                    <li key={i}>
                      {s.direction === 'bullish' ? S.signals.bullish : S.signals.bearish}{S.signals.sweepAt}{' '}
                      {formatPrice(s.price)}
                      {s.pool ? S.signals.pool : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Show a hint when no overlays are active (e.g. Step 0) */}
          {!Object.values(overlays).some(Boolean) && (
            <p className="summary-panel__count" style={{ fontStyle: 'italic' }}>
              {S.preflightHint}
            </p>
          )}
        </>
      )}
    </aside>
  );
}

export default SummaryPanel;
