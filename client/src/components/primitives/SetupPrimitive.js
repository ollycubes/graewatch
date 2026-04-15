/**
 * Chart primitive that draws the three structural levels of an SMC setup:
 *
 *   Entry zone  — semi-transparent box at the entry POI price range
 *   Target line — dashed horizontal line at the target price
 *   Stop line   — dashed horizontal line at the stop / invalidation level
 *
 * All lines extend from the right edge of the visible data to a fixed width
 * so they are always visible regardless of scroll position.
 */

const COLORS = {
  bullish: {
    entry: 'rgba(38, 166, 154, 0.18)',
    entryBorder: 'rgba(38, 166, 154, 0.80)',
    target: '#26a69a',
    stop: '#ef5350',
  },
  bearish: {
    entry: 'rgba(239, 83, 80, 0.18)',
    entryBorder: 'rgba(239, 83, 80, 0.80)',
    target: '#ef5350',
    stop: '#26a69a',
  },
};

const LINE_EXTEND = 80; // px the lines extend past the last candle

class SetupRenderer {
  constructor(data) {
    this._data = data;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const d = this._data;
      if (!d) return;

      const { xRight, bias, yEntryTop, yEntryBottom, yTarget, yStop } = d;
      const x1 = xRight;
      const x2 = xRight + LINE_EXTEND;
      const colors = COLORS[bias] || COLORS.bullish;

      // ── Entry zone box ───────────────────────────────────────────────────
      const entryH = yEntryBottom - yEntryTop;
      ctx.fillStyle = colors.entry;
      ctx.fillRect(x1, yEntryTop, x2 - x1, entryH);

      ctx.strokeStyle = colors.entryBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      // Top edge
      ctx.beginPath();
      ctx.moveTo(x1, yEntryTop);
      ctx.lineTo(x2, yEntryTop);
      ctx.stroke();
      // Bottom edge
      ctx.beginPath();
      ctx.moveTo(x1, yEntryBottom);
      ctx.lineTo(x2, yEntryBottom);
      ctx.stroke();

      // Entry label
      ctx.fillStyle = colors.entryBorder;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('ENTRY', x1 + 4, yEntryTop - 3);

      // ── Target line ──────────────────────────────────────────────────────
      ctx.strokeStyle = colors.target;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, yTarget);
      ctx.lineTo(x2, yTarget);
      ctx.stroke();

      ctx.fillStyle = colors.target;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', x2 + 4, yTarget);

      // ── Stop line ────────────────────────────────────────────────────────
      ctx.strokeStyle = colors.stop;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, yStop);
      ctx.lineTo(x2, yStop);
      ctx.stroke();

      ctx.fillStyle = colors.stop;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', x2 + 4, yStop);

      ctx.setLineDash([]);
    });
  }
}

class SetupPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'top';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || !src._setup || !src._setup.valid) {
      return null;
    }

    const setup = src._setup;
    const timeScale = src._chart.timeScale();
    const series = src._series;

    const visibleRange = timeScale.getVisibleRange();
    if (!visibleRange) return null;

    const xRight = timeScale.timeToCoordinate(visibleRange.to);
    if (xRight === null) return null;

    const yEntryTop = series.priceToCoordinate(setup.entry_top);
    const yEntryBottom = series.priceToCoordinate(setup.entry_bottom);
    const yTarget = series.priceToCoordinate(setup.target);
    const yStop = series.priceToCoordinate(setup.stop);

    if (
      yEntryTop === null ||
      yEntryBottom === null ||
      yTarget === null ||
      yStop === null
    ) {
      return null;
    }

    return new SetupRenderer({
      xRight,
      bias: setup.bias,
      yEntryTop: Math.min(yEntryTop, yEntryBottom),
      yEntryBottom: Math.max(yEntryTop, yEntryBottom),
      yTarget,
      yStop,
    });
  }
}

export class SetupPrimitive {
  constructor() {
    this._setup = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new SetupPaneView(this);
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

  setSetup(setup) {
    this._setup = setup;
    if (this._requestUpdate) this._requestUpdate();
  }

  clear() {
    this._setup = null;
    if (this._requestUpdate) this._requestUpdate();
  }
}
