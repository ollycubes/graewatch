/**
 * Custom lightweight-charts primitive that draws a selection box on the chart.
 *
 * The box is a semi-transparent rectangle with a dashed border that
 * highlights the user's selected time/price range for contextual analysis.
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
      const { x1, x2, yTop, yBottom, candleCount } = this._box;
      const w = x2 - x1;
      const h = yBottom - yTop;

      // Fill
      ctx.fillStyle = COLORS.fill;
      ctx.fillRect(x1, yTop, w, h);

      // Dashed border
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x1, yTop, w, h);
      ctx.setLineDash([]);

      // Label badge at the top of the box
      if (candleCount != null) {
        const label = `${candleCount} candles`;
        ctx.font = '11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        const padX = 6;
        const padY = 3;
        const badgeW = textWidth + padX * 2;
        const badgeH = 16;
        const badgeX = x1 + w / 2 - badgeW / 2;
        const badgeY = yTop - badgeH - 4;

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
    return 'top';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || !src._selection) {
      return null;
    }

    const { startTime, endTime, highPrice, lowPrice, candleCount } = src._selection;
    const timeScale = src._chart.timeScale();
    const series = src._series;

    const x1 = timeScale.timeToCoordinate(startTime);
    const x2 = timeScale.timeToCoordinate(endTime);
    const yTop = series.priceToCoordinate(highPrice);
    const yBottom = series.priceToCoordinate(lowPrice);

    if (x1 === null || x2 === null || yTop === null || yBottom === null) {
      return null;
    }

    return new SelectionBoxRenderer({
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      yTop: Math.min(yTop, yBottom),
      yBottom: Math.max(yTop, yBottom),
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

  /**
   * Set the selection box coordinates.
   * @param {{ startTime: number, endTime: number, highPrice: number, lowPrice: number, candleCount: number }} sel
   */
  setSelection(sel) {
    this._selection = sel;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  /** Clear the selection box from the chart. */
  clear() {
    this._selection = null;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
