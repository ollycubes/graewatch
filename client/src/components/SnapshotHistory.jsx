import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import content from '../content.json';

const { journal: J, maps } = content;
const BIAS_COLOR = maps.biasColor;
const BIAS_ARROW = maps.biasArrow;
const TYPE_LABELS = maps.typeLabels;
const OUTCOMES = maps.outcomes;

function formatPrice(p) {
  return typeof p === 'number' ? p.toFixed(5) : '—';
}

function formatDate(ts) {
  if (!ts) return '';
  const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatSavedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

// ── Performance metrics from snapshot list ────────────────────────────────────
function computeMetrics(snaps) {
  const completed = snaps.filter((s) => s.outcome && s.outcome !== 'pending');
  const wins = completed.filter((s) => s.outcome === 'win');
  const losses = completed.filter((s) => s.outcome === 'loss');
  const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : null;
  const rrValues = completed.filter((s) => s.risk_reward != null).map((s) => s.risk_reward);
  const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;
  const totalR = wins.reduce((sum, s) => sum + (s.risk_reward ?? 1), 0) - losses.length;
  return {
    total: snaps.length,
    completed: completed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgRR,
    totalR,
  };
}

// ── Demo capital simulation ───────────────────────────────────────────────────
function simulateEquity(snaps, startingBalance, riskPct) {
  const ordered = [...snaps]
    .filter((s) => s.outcome && s.outcome !== 'pending')
    .sort((a, b) => new Date(a.saved_at) - new Date(b.saved_at));

  let balance = startingBalance;
  const curve = [{ label: 'Start', balance }];

  for (const snap of ordered) {
    const risk = balance * (riskPct / 100);
    if (snap.outcome === 'win') {
      balance += risk * (snap.risk_reward ?? 1);
    } else if (snap.outcome === 'loss') {
      balance -= risk;
    }
    curve.push({ label: formatDate(snap.saved_at), balance: Math.max(0, balance) });
  }
  return { finalBalance: balance, curve };
}

// ── Performance summary bar ───────────────────────────────────────────────────
function PerformanceSummary({ snaps, startingBalance, riskPct, onBalanceChange, onRiskChange }) {
  const m = computeMetrics(snaps);
  const { finalBalance } = simulateEquity(snaps, startingBalance, riskPct);
  const pnl = finalBalance - startingBalance;
  const pnlPct = startingBalance > 0 ? (pnl / startingBalance) * 100 : 0;

  return (
    <div className="sim-summary">
      <div className="sim-summary__metrics">
        <div className="sim-summary__metric">
          <span className="sim-summary__label">{J.metrics.trades}</span>
          <span className="sim-summary__value">
            {m.completed} / {m.total}
          </span>
        </div>
        <div className="sim-summary__metric">
          <span className="sim-summary__label">{J.metrics.winRate}</span>
          <span
            className="sim-summary__value"
            style={{
              color: m.winRate >= 50 ? '#2ecc71' : m.winRate != null ? '#e74c3c' : undefined,
            }}
          >
            {m.winRate != null ? `${m.winRate.toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="sim-summary__metric">
          <span className="sim-summary__label">{J.metrics.wl}</span>
          <span className="sim-summary__value">
            {m.wins} / {m.losses}
          </span>
        </div>
        <div className="sim-summary__metric">
          <span className="sim-summary__label">{J.metrics.avgRR}</span>
          <span className="sim-summary__value">
            {m.avgRR != null ? `1 : ${m.avgRR.toFixed(1)}` : '—'}
          </span>
        </div>
        <div className="sim-summary__metric">
          <span className="sim-summary__label">{J.metrics.totalR}</span>
          <span
            className="sim-summary__value"
            style={{ color: m.totalR >= 0 ? '#2ecc71' : '#e74c3c' }}
          >
            {m.completed > 0 ? (m.totalR >= 0 ? '+' : '') + m.totalR.toFixed(1) + 'R' : '—'}
          </span>
        </div>
      </div>

      <div className="sim-summary__divider" />

      <div className="sim-summary__capital">
        <span className="sim-summary__label">{J.metrics.demoCapital}</span>
        <div className="sim-summary__capital-inputs">
          <div className="sim-summary__input-group">
            <span className="sim-summary__input-prefix">$</span>
            <input
              className="sim-summary__input"
              type="number"
              min="100"
              step="500"
              value={startingBalance}
              onChange={(e) => onBalanceChange(Number(e.target.value))}
              title="Starting balance"
            />
          </div>
          <div className="sim-summary__input-group">
            <input
              className="sim-summary__input sim-summary__input--sm"
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={riskPct}
              onChange={(e) => onRiskChange(Number(e.target.value))}
              title="Risk % per trade"
            />
            <span className="sim-summary__input-suffix">% risk</span>
          </div>
        </div>
        <div className="sim-summary__equity">
          <span className="sim-summary__equity-balance">
            $
            {finalBalance.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
          <span
            className="sim-summary__equity-pnl"
            style={{ color: pnl >= 0 ? '#2ecc71' : '#e74c3c' }}
          >
            {pnl >= 0 ? '+' : ''}$
            {Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })} (
            {pnlPct >= 0 ? '+' : ''}
            {pnlPct.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Snapshot card ─────────────────────────────────────────────────────────────
function SnapshotCard({ snap, onDelete, onUpdate, authHeaders }) {
  const [confirming, setConfirming] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [note, setNote] = useState(snap.note ?? '');
  const [editingNote, setEditingNote] = useState(false);

  async function handleOutcome(value) {
    const next = snap.outcome === value ? 'pending' : value;
    await fetch(`/api/snapshots/${snap.id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ outcome: next }),
    });
    onUpdate(snap.id, { outcome: next });
  }

  async function saveNote() {
    await fetch(`/api/snapshots/${snap.id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ note }),
    });
    onUpdate(snap.id, { note });
    setEditingNote(false);
  }

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDelete(snap.id);
  }

  const outcome = snap.outcome ?? 'pending';
  const outcomeColor = OUTCOMES.find((o) => o.value === outcome)?.color ?? '#888';

  return (
    <div className={`snapshot-card snapshot-card--${outcome}`}>
      <div className="snapshot-card__header">
        <span className="snapshot-card__pair">
          {snap.pair} · {snap.interval?.toUpperCase()}
        </span>
        {snap.bias && (
          <span className="snapshot-card__bias" style={{ color: BIAS_COLOR[snap.bias] }}>
            {BIAS_ARROW[snap.bias]} {snap.bias}
          </span>
        )}
        <span className="snapshot-card__saved-at">{formatSavedAt(snap.saved_at)}</span>
        {snap.screenshot && (
          <button className="snapshot-card__toggle-img" onClick={() => setImgOpen((o) => !o)}>
            {imgOpen ? '▲ Chart' : '▼ Chart'}
          </button>
        )}
        <button
          className={`snapshot-card__delete${confirming ? ' snapshot-card__delete--confirm' : ''}`}
          onClick={handleDelete}
          onBlur={() => setConfirming(false)}
          title={confirming ? J.buttons.deleteConfirmTitle : J.buttons.deleteTitle}
        >
          {confirming ? J.buttons.deleteConfirmLabel : J.buttons.deleteLabel}
        </button>
      </div>

      <div className="snapshot-card__range">
        {formatDate(snap.selection_start)} → {formatDate(snap.selection_end)}
      </div>

      {snap.entry_top != null && (
        <div className="snapshot-card__levels">
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">{J.levels.entry}</span>
            <span className="snapshot-card__level-value">
              {formatPrice(snap.entry_bottom)} – {formatPrice(snap.entry_top)}
            </span>
            {snap.entry_type && (
              <span className="snapshot-card__tag">
                {TYPE_LABELS[snap.entry_type] ?? snap.entry_type}
              </span>
            )}
          </div>
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">{J.levels.target}</span>
            <span className="snapshot-card__level-value">{formatPrice(snap.target)}</span>
            {snap.target_type && (
              <span className="snapshot-card__tag">
                {TYPE_LABELS[snap.target_type] ?? snap.target_type}
              </span>
            )}
          </div>
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">{J.levels.stop}</span>
            <span className="snapshot-card__level-value">{formatPrice(snap.stop)}</span>
          </div>
          {snap.risk_reward != null && (
            <div className="snapshot-card__level">
              <span className="snapshot-card__level-label">{J.levels.rr}</span>
              <span className="snapshot-card__level-value">
                {J.levels.rrPrefix}
                {snap.risk_reward}
              </span>
            </div>
          )}
        </div>
      )}

      {snap.entry_top == null && <div className="snapshot-card__no-setup">{J.noSetup}</div>}

      {/* Outcome buttons */}
      <div className="snapshot-card__outcomes">
        {OUTCOMES.filter((o) => o.value !== 'pending').map((o) => (
          <button
            key={o.value}
            className={`snapshot-card__outcome-btn${outcome === o.value ? ' snapshot-card__outcome-btn--active' : ''}`}
            style={outcome === o.value ? { borderColor: o.color, color: o.color } : {}}
            onClick={() => handleOutcome(o.value)}
          >
            {o.label}
          </button>
        ))}
        {outcome !== 'pending' && (
          <span className="snapshot-card__outcome-badge" style={{ color: outcomeColor }}>
            {OUTCOMES.find((o) => o.value === outcome)?.label}
          </span>
        )}
      </div>

      {/* Note */}
      <div className="snapshot-card__note-row">
        {editingNote ? (
          <div className="snapshot-card__note-edit">
            <input
              className="snapshot-card__note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNote();
                if (e.key === 'Escape') setEditingNote(false);
              }}
              placeholder={J.notePlaceholder}
              autoFocus
            />
            <button className="snapshot-card__note-save" onClick={saveNote}>
              {J.buttons.save}
            </button>
            <button className="snapshot-card__note-cancel" onClick={() => setEditingNote(false)}>
              {J.buttons.cancel}
            </button>
          </div>
        ) : (
          <button className="snapshot-card__note-trigger" onClick={() => setEditingNote(true)}>
            {note ? `📝 ${note}` : J.addNote}
          </button>
        )}
      </div>

      {snap.screenshot && imgOpen && (
        <img className="snapshot-card__screenshot" src={snap.screenshot} alt="Chart snapshot" />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
function SnapshotHistory({ pair }) {
  const { authHeaders } = useAuth();
  const [snaps, setSnaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startingBalance, setStartingBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/snapshots?pair=${encodeURIComponent(pair)}`, {
        headers: authHeaders(),
      });
      if (res.ok) setSnaps(await res.json());
    } finally {
      setLoading(false);
    }
  }, [pair, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id) {
    await fetch(`/api/snapshots/${id}`, { method: 'DELETE', headers: authHeaders() });
    setSnaps((prev) => prev.filter((s) => s.id !== id));
  }

  function handleUpdate(id, changes) {
    setSnaps((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  }

  return (
    <div className="snapshot-history">
      <div className="snapshot-history__header">
        <h3 className="snapshot-history__title">{J.title}</h3>
        <button className="snapshot-history__refresh" onClick={load} title={J.title}>
          ↻
        </button>
      </div>

      {snaps.length > 0 && (
        <PerformanceSummary
          snaps={snaps}
          startingBalance={startingBalance}
          riskPct={riskPct}
          onBalanceChange={setStartingBalance}
          onRiskChange={setRiskPct}
        />
      )}

      {loading && <p className="snapshot-history__empty">{J.loading}</p>}

      {!loading && snaps.length === 0 && <p className="snapshot-history__empty">{J.empty}</p>}

      {!loading && snaps.length > 0 && (
        <div className="snapshot-history__list">
          {snaps.map((s) => (
            <SnapshotCard
              key={s.id}
              snap={s}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              authHeaders={authHeaders}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SnapshotHistory;
