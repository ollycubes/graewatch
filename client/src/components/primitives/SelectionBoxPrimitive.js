/**
 * Custom lightweight-charts v5 primitive that draws a selection box on the chart.
 *
 * The box spans the FULL chart height — the Y dimension of the original drag
 * is not preserved across timeframe changes because priceToCoordinate() returns
 * null when the selection's prices fall outside the newly auto-scaled price axis
 * (which happens every time you switch to a lower timeframe with a narrower range).
 *
 * Only the time range (X axis) is preserved, which is the meaningful dimension
 * for SMC top-down analysis.
 */

const COLORS = {
  fill: 'rgba(212, 160, 84, 0.10)',
  border: 'rgba(212, 160, 84, 0.65)',
  labelBg: 'rgba(212, 160, 84, 0.85)',
  labelText: '#fff',
};

class SelectionBoxRenderer {
  constructor(box) {
    this._box = box;
  }

  draw(target) {
    if (!this._box) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const { x1, x2, candleCount } = this._box;
      const w = x2 - x1;

      // Span full canvas height so the box is always visible regardless of
      // which timeframe is active or how the price scale has been auto-scaled.
      const h = ctx.canvas.clientHeight;

      ctx.fillStyle = COLORS.fill;
      ctx.fillRect(x1, 0, w, h);

      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x1, 0, w, h);
      ctx.setLineDash([]);

      // Candle count badge at the top of the box
      if (candleCount != null) {
        const label = `${candleCount} candles`;
        ctx.font = '11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const padX = 6;
        const padY = 3;
        const badgeW = textWidth + padX * 2;
        const badgeH = 16;
        const badgeX = x1 + w / 2 - badgeW / 2;
        const badgeY = 6; // fixed near the top of the chart

        ctx.fillStyle = COLORS.labelBg;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();

        ctx.fillStyle = COLORS.labelText;
        ctx.fillText(label, badgeX + padX, badgeY + badgeH - padY);
      }
    });
  }
}

class SelectionBoxPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || !src._selection) return null;

    const { startTime, endTime, candleCount } = src._selection;
    const timeScale = src._chart.timeScale();

    const visibleRange = timeScale.getVisibleRange();
    if (!visibleRange) return null;

    // Skip if selection is entirely outside the loaded data range
    if (endTime < visibleRange.from || startTime > visibleRange.to) return null;

    const clampedStart = Math.max(startTime, visibleRange.from);
    const clampedEnd = Math.min(endTime, visibleRange.to);

    const x1 = timeScale.timeToCoordinate(clampedStart);
    const x2 = timeScale.timeToCoordinate(clampedEnd);

    if (x1 === null || x2 === null) return null;

    return new SelectionBoxRenderer({
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      candleCount,
    });
  }
}

export class SelectionBoxPrimitive {
  constructor() {
    this._selection = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new SelectionBoxPaneView(this);
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  setSelection(sel) {
    this._selection = sel;
    if (this._requestUpdate) this._requestUpdate();
  }

  clear() {
    this._selection = null;
    if (this._requestUpdate) this._requestUpdate();
  }
}
