import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import content from '../content.json';

const { setup: SC, maps } = content;

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

const TYPE_LABELS = maps.typeLabels;
const TF_SHORT = maps.tfShort;
const BIAS_ARROW = maps.biasArrow;

// ── Confidence scoring ────────────────────────────────────────────────────────
function computeConfidence(setup, zones, biasChain) {
  let score = 0;

  // Bias chain alignment (0–30): how many TFs agree on one direction
  if (biasChain) {
    const tfs = ['weekly', 'daily', '4h', '1h', '15min'];
    const values = tfs.map((tf) => biasChain[tf]).filter(Boolean);
    if (values.length > 0) {
      const counts = {};
      for (const v of values) counts[v] = (counts[v] || 0) + 1;
      const maxAligned = Math.max(...Object.values(counts));
      score += Math.round((maxAligned / tfs.length) * 30);
    }
  }

  // Zone quality (0–25): normalized top-zone conviction score
  const topZone = zones[0];
  if (topZone) {
    score += Math.min(Math.round((topZone.score / 10) * 25), 25);
  }

  // Setup validity + R:R quality (0–25)
  if (setup?.valid) {
    let s = 8;
    const rr = setup.risk_reward ?? 0;
    if (rr >= 4) s += 17;
    else if (rr >= 3) s += 12;
    else if (rr >= 2) s += 8;
    else if (rr >= 1.5) s += 4;
    score += Math.min(s, 25);
  }

  // Structural factors (0–20): POI, liquidity, cluster
  if (topZone?.score_breakdown?.at_poi > 0 || setup?.at_poi) score += 8;
  if (topZone?.score_breakdown?.liquidity > 0) score += 6;
  if ((topZone?.cluster_size ?? 1) > 1) score += 6;

  return Math.min(Math.round(score), 100);
}

function confidenceMeta(score) {
  if (score >= 76) return { label: SC.confidence.high, color: '#3a9e7e' };
  if (score >= 51) return { label: SC.confidence.strong, color: '#5b8fd9' };
  if (score >= 26) return { label: SC.confidence.moderate, color: '#d4a054' };
  return { label: SC.confidence.low, color: '#c0533a' };
}

function ConfidencePill({ score }) {
  const { label, color } = confidenceMeta(score);
  return (
    <div className="conf-pill">
      <div className="conf-pill__track">
        <div className="conf-pill__fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="conf-pill__score" style={{ color }}>
        {score}
      </span>
      <span className="conf-pill__label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
const BREAKDOWN_LABELS = maps.breakdownLabels;

function BiasBadge({ bias }) {
  const cls =
    bias === 'bullish'
      ? 'setup-card__bias--bullish'
      : bias === 'bearish'
        ? 'setup-card__bias--bearish'
        : 'setup-card__bias--neutral';
  const label = maps.biasLabel[bias] ?? maps.biasLabel.neutral;
  return <span className={`setup-card__bias ${cls}`}>{label}</span>;
}

function BiasChain({ chain, mod = '' }) {
  if (!chain || Object.keys(chain).length === 0) return null;
  const order = ['weekly', 'daily', '4h', '1h', '15min'];
  const entries = order.filter((tf) => chain[tf]);
  return (
    <div className={`bias-chain${mod ? ` ${mod}` : ''}`}>
      {entries.map((tf) => (
        <span key={tf} className={`bias-chain__item bias-chain__item--${chain[tf]}`}>
          {TF_SHORT[tf]} {BIAS_ARROW[chain[tf]] ?? chain[tf]}
        </span>
      ))}
    </div>
  );
}

function ZoneRow({ zone, rank }) {
  const bd = zone.score_breakdown || {};
  const tfMatches = zone.tf_matches || [];
  const breakdownItems = Object.entries(BREAKDOWN_LABELS)
    .map(([key, label]) => ({ label, val: bd[key] }))
    .filter((i) => i.val > 0);

  return (
    <div className="setup-overlay__zone">
      <div className="setup-overlay__zone-header">
        <span className="setup-overlay__zone-rank">#{rank}</span>
        <span className="setup-overlay__zone-type">
          {TYPE_LABELS[zone.source_type] ?? zone.source_type}
        </span>
        <span className="setup-overlay__zone-range">
          {zone.bottom?.toFixed(5)} – {zone.top?.toFixed(5)}
        </span>
        <span className="setup-overlay__zone-score">{zone.score}</span>
        {zone.cluster_size > 1 && (
          <span className="setup-overlay__zone-confluence">×{zone.cluster_size}</span>
        )}
        {tfMatches.map((tf) => (
          <span key={tf} className="setup-overlay__zone-tf">
            {TF_SHORT[tf] ?? tf}
          </span>
        ))}
      </div>
      {breakdownItems.length > 0 && (
        <div className="setup-overlay__zone-breakdown">
          {breakdownItems.map((i) => (
            <span key={i.label} className="setup-overlay__zone-bd-item">
              {i.label} +{i.val}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupDetailOverlay({
  pair,
  interval,
  setup,
  zones,
  biasChain,
  entryBottom,
  entryTop,
  entryType,
  atPoi,
  confidence,
  onClose,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="setup-overlay__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="setup-overlay" ref={ref} role="dialog" aria-modal="true">
        <div className="setup-overlay__header">
          <div className="setup-overlay__title">
            <span className="setup-overlay__pair">
              {pair} · {interval.toUpperCase()}
            </span>
            <span className="setup-overlay__subtitle">{SC.subtitle}</span>
          </div>
          <button className="setup-overlay__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Bias */}
        {biasChain && (
          <div className="setup-overlay__section">
            <h3 className="setup-overlay__section-title">{SC.sections.biasChain}</h3>
            <BiasChain chain={biasChain} />
          </div>
        )}

        {/* Levels */}
        {setup?.valid && (
          <div className="setup-overlay__section">
            <h3 className="setup-overlay__section-title">{SC.sections.levels}</h3>
            <div className="setup-overlay__levels">
              <div className={`setup-overlay__level${atPoi ? ' setup-overlay__level--poi' : ''}`}>
                <span className="setup-overlay__level-label">{SC.levels.entry}</span>
                <span className="setup-overlay__level-value">
                  {formatPrice(entryBottom)} – {formatPrice(entryTop)}
                </span>
                {entryType && <span className="setup-card__tag">{TYPE_LABELS[entryType]}</span>}
              </div>
              <div className="setup-overlay__level">
                <span className="setup-overlay__level-label">{SC.levels.target}</span>
                <span className="setup-overlay__level-value">{formatPrice(setup.target)}</span>
                {setup.target_type && (
                  <span className="setup-card__tag">{TYPE_LABELS[setup.target_type]}</span>
                )}
              </div>
              <div className="setup-overlay__level">
                <span className="setup-overlay__level-label">{SC.levels.stop}</span>
                <span className="setup-overlay__level-value">{formatPrice(setup.stop)}</span>
              </div>
              <div className="setup-overlay__level setup-overlay__level--rr">
                <span className="setup-overlay__level-label">{SC.levels.rr}</span>
                <span className="setup-overlay__level-value setup-overlay__rr-value">
                  {SC.levels.rrPrefix}
                  {setup.risk_reward}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Zone Conviction */}
        {zones.length > 0 && (
          <div className="setup-overlay__section">
            <h3 className="setup-overlay__section-title">
              {SC.sections.confluenceZones}{' '}
              <span className="setup-overlay__section-count">
                {zones.length} {SC.sections.found}
              </span>
            </h3>
            <div className="setup-overlay__zones">
              {zones.map((z, i) => (
                <ZoneRow key={i} zone={z} rank={i + 1} />
              ))}
            </div>
          </div>
        )}

        {/* Confidence */}
        {confidence !== null && (
          <div className="setup-overlay__section">
            <h3 className="setup-overlay__section-title">{SC.sections.confidence}</h3>
            <div className="conf-breakdown">
              <div className="conf-breakdown__bar-row">
                <div className="conf-breakdown__track">
                  <div
                    className="conf-breakdown__fill"
                    style={{
                      width: `${confidence}%`,
                      background: confidenceMeta(confidence).color,
                    }}
                  />
                </div>
                <span
                  className="conf-breakdown__score"
                  style={{ color: confidenceMeta(confidence).color }}
                >
                  {confidence}
                  {SC.confidence.scoreSuffix}
                </span>
              </div>
              <span
                className="conf-breakdown__label"
                style={{ color: confidenceMeta(confidence).color }}
              >
                {confidenceMeta(confidence).label}
              </span>
              <div className="conf-breakdown__factors">
                {SC.confidence.factors.map((f) => (
                  <span key={f} className="conf-breakdown__factor">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {zones.length === 0 && !setup?.valid && (
          <p className="setup-overlay__empty">{SC.noZonesOrSetup}</p>
        )}
      </div>
    </div>
  );
}

function SetupCard({ pair, interval, selection, onClearSelection, onSetup, screenshotRef }) {
  const { authHeaders } = useAuth();
  const [setup, setSetup] = useState(null);
  const [zones, setZones] = useState([]);
  const [biasChain, setBiasChain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!selection) {
      setSetup(null);
      setZones([]);
      setBiasChain(null);
      setError('');
      setLoading(false);
      setOverlayOpen(false);
      if (onSetup) onSetup(null);
      return;
    }

    const ctrl = new AbortController();

    async function fetchAll() {
      setLoading(true);
      setError('');
      const range = `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
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
          setZones(data.zones || []);
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

  async function handleSave() {
    if (!selection || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      // Small delay ensures chart primitives (entry/target/stop) have painted before capture
      await new Promise((r) => setTimeout(r, 120));
      const screenshot = screenshotRef?.current ? screenshotRef.current() : null;
      await fetch('/api/snapshots', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          pair,
          interval,
          selection_start: selection.start,
          selection_end: selection.end,
          bias: setup?.bias ?? null,
          entry_top: setup?.entry_top ?? null,
          entry_bottom: setup?.entry_bottom ?? null,
          entry_type: setup?.entry_type ?? null,
          target: setup?.target ?? null,
          target_type: setup?.target_type ?? null,
          stop: setup?.stop ?? null,
          risk_reward: setup?.risk_reward ?? null,
          screenshot: screenshot ?? null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent fail — non-critical
    } finally {
      setSaving(false);
    }
  }

  const topZone = zones[0] ?? null;
  const entryTop = topZone ? topZone.top : setup?.entry_top;
  const entryBottom = topZone ? topZone.bottom : setup?.entry_bottom;
  const entryType = topZone ? topZone.source_type : setup?.entry_type;
  const atPoi = topZone ? topZone.score_breakdown?.at_poi > 0 : setup?.at_poi;

  const hasDetail = setup || zones.length > 0 || biasChain;
  const confidence = setup?.valid ? computeConfidence(setup, zones, biasChain) : null;

  return (
    <>
      <div
        className={`setup-card${hasDetail ? ' setup-card--clickable' : ''}`}
        onClick={hasDetail ? () => setOverlayOpen(true) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onKeyDown={
          hasDetail
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') setOverlayOpen(true);
              }
            : undefined
        }
      >
        {/* ── Row 1: header — always fully visible ── */}
        <div className="setup-card__header">
          <div className="setup-card__header-left">
            <span className="setup-card__pair">
              {pair} · {interval.toUpperCase()}
            </span>
            {setup && <BiasBadge bias={setup.bias} />}
            {loading && <span className="setup-card__hint">{SC.analysing}</span>}
            {error && <span className="setup-card__error">{error}</span>}
            {!setup && !loading && !error && <span className="setup-card__hint">{SC.hint}</span>}
            {biasChain && <BiasChain chain={biasChain} />}
          </div>

          {selection && (
            <div className="setup-card__actions" onClick={(e) => e.stopPropagation()}>
              <span className="setup-card__selection-dates">
                {formatDate(selection.start)} → {formatDate(selection.end)}
              </span>
              <button
                className={`setup-card__save${saved ? ' setup-card__save--done' : ''}`}
                onClick={handleSave}
                disabled={saving}
                title={SC.saveTitle}
              >
                {saved ? SC.savedLabel : saving ? SC.savingLabel : SC.saveLabel}
              </button>
              <button
                className="setup-card__clear"
                onClick={onClearSelection}
                title={SC.clearTitle}
              >
                ✕
              </button>
              {hasDetail && <span className="setup-card__expand-hint">{SC.expandHint}</span>}
            </div>
          )}
        </div>

        {/* ── Row 2: levels — only when setup is valid ── */}
        {setup && setup.valid && (
          <div className="setup-card__body">
            <div className={`setup-card__level${atPoi ? ' setup-card__level--poi' : ''}`}>
              <span className="setup-card__level-label">{SC.levels.entry}</span>
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
              <span className="setup-card__level-label">{SC.levels.target}</span>
              <span className="setup-card__level-value">{formatPrice(setup.target)}</span>
              {setup.target_type && (
                <span className="setup-card__tag">{TYPE_LABELS[setup.target_type]}</span>
              )}
            </div>

            <div className="setup-card__level-sep" />

            <div className="setup-card__level">
              <span className="setup-card__level-label">{SC.levels.stop}</span>
              <span className="setup-card__level-value">{formatPrice(setup.stop)}</span>
            </div>

            <div className="setup-card__level-sep" />

            <div className="setup-card__level">
              <span className="setup-card__level-label">{SC.levels.rr}</span>
              <span className="setup-card__rr-value">
                {SC.levels.rrPrefix}
                {setup.risk_reward}
              </span>
            </div>

            {confidence !== null && (
              <>
                <div className="setup-card__level-sep" />
                <ConfidencePill score={confidence} />
              </>
            )}
          </div>
        )}

        {setup && !setup.valid && <p className="setup-card__no-setup">{SC.noSetup}</p>}
      </div>

      {overlayOpen && (
        <SetupDetailOverlay
          pair={pair}
          interval={interval}
          setup={setup}
          zones={zones}
          biasChain={biasChain}
          entryBottom={entryBottom}
          entryTop={entryTop}
          entryType={entryType}
          atPoi={atPoi}
          confidence={confidence}
          onClose={() => setOverlayOpen(false)}
        />
      )}
    </>
  );
}

export default SetupCard;
