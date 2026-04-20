import { useEffect, useState, useCallback } from 'react';

const BIAS_COLOR = { bullish: '#2ecc71', bearish: '#e74c3c', neutral: '#888' };
const BIAS_ARROW = { bullish: '▲', bearish: '▼', neutral: '—' };
const TYPE_LABELS = { ob: 'OB', fvg: 'FVG', swing: 'Swing', confluence: 'Conf' };

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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function SnapshotCard({ snap, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    onDelete(snap.id);
  }

  return (
    <div className="snapshot-card">
      <div className="snapshot-card__header">
        <span className="snapshot-card__pair">{snap.pair} · {snap.interval?.toUpperCase()}</span>
        {snap.bias && (
          <span className="snapshot-card__bias" style={{ color: BIAS_COLOR[snap.bias] }}>
            {BIAS_ARROW[snap.bias]} {snap.bias}
          </span>
        )}
        <span className="snapshot-card__saved-at">{formatSavedAt(snap.saved_at)}</span>
        {snap.screenshot && (
          <button
            className="snapshot-card__toggle-img"
            onClick={() => setImgOpen((o) => !o)}
            title={imgOpen ? 'Hide chart' : 'Show chart'}
          >
            {imgOpen ? '▲ Chart' : '▼ Chart'}
          </button>
        )}
        <button
          className={`snapshot-card__delete${confirming ? ' snapshot-card__delete--confirm' : ''}`}
          onClick={handleDelete}
          onBlur={() => setConfirming(false)}
          title={confirming ? 'Click again to confirm' : 'Delete snapshot'}
        >
          {confirming ? 'Delete?' : '✕'}
        </button>
      </div>

      <div className="snapshot-card__range">
        {formatDate(snap.selection_start)} → {formatDate(snap.selection_end)}
      </div>

      {snap.entry_top != null && (
        <div className="snapshot-card__levels">
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">ENTRY</span>
            <span className="snapshot-card__level-value">
              {formatPrice(snap.entry_bottom)} – {formatPrice(snap.entry_top)}
            </span>
            {snap.entry_type && (
              <span className="snapshot-card__tag">{TYPE_LABELS[snap.entry_type] ?? snap.entry_type}</span>
            )}
          </div>
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">TARGET</span>
            <span className="snapshot-card__level-value">{formatPrice(snap.target)}</span>
            {snap.target_type && (
              <span className="snapshot-card__tag">{TYPE_LABELS[snap.target_type] ?? snap.target_type}</span>
            )}
          </div>
          <div className="snapshot-card__level">
            <span className="snapshot-card__level-label">STOP</span>
            <span className="snapshot-card__level-value">{formatPrice(snap.stop)}</span>
          </div>
          {snap.risk_reward != null && (
            <div className="snapshot-card__level">
              <span className="snapshot-card__level-label">R:R</span>
              <span className="snapshot-card__level-value">1 : {snap.risk_reward}</span>
            </div>
          )}
        </div>
      )}

      {snap.entry_top == null && (
        <div className="snapshot-card__no-setup">No valid setup at time of save</div>
      )}

      {snap.screenshot && imgOpen && (
        <img
          className="snapshot-card__screenshot"
          src={snap.screenshot}
          alt="Chart snapshot"
        />
      )}
    </div>
  );
}

function SnapshotHistory({ pair }) {
  const [snaps, setSnaps] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/snapshots?pair=${encodeURIComponent(pair)}`);
      if (res.ok) setSnaps(await res.json());
    } finally {
      setLoading(false);
    }
  }, [pair]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
    setSnaps((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="snapshot-history">
      <div className="snapshot-history__header">
        <h3 className="snapshot-history__title">Saved Snapshots</h3>
        <button className="snapshot-history__refresh" onClick={load} title="Refresh">↻</button>
      </div>

      {loading && <p className="snapshot-history__empty">Loading…</p>}

      {!loading && snaps.length === 0 && (
        <p className="snapshot-history__empty">
          No snapshots yet. Make a selection and click <strong>Save</strong> to log it.
        </p>
      )}

      {!loading && snaps.length > 0 && (
        <div className="snapshot-history__list">
          {snaps.map((s) => (
            <SnapshotCard key={s.id} snap={s} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SnapshotHistory;
