/**
 * Custom lightweight-charts v5 primitive that draws Gann boxes on the chart.
 *
 * Each Gann box is a rectangle between a swing high and swing low with:
 * - Bounding rectangle outline
 * - Horizontal grid lines at 0.25, 0.5, 0.75 of the price range
 * - Vertical grid lines at 0.25, 0.5, 0.75 of the time range
 * - Diagonal angle lines: 1x1 (corner-to-corner), 2x1, and 1x2
 */

const SUBDIVISIONS = [0.25, 0.5, 0.75];

const COLORS = {
  bullish: {
    fill: 'rgba(255, 193, 7, 0.08)',
    border: 'rgba(255, 193, 7, 0.6)',
    grid: 'rgba(255, 193, 7, 0.25)',
    diagonal: 'rgba(255, 193, 7, 0.4)',
  },
  bearish: {
    fill: 'rgba(255, 152, 0, 0.08)',
    border: 'rgba(255, 152, 0, 0.6)',
    grid: 'rgba(255, 152, 0, 0.25)',
    diagonal: 'rgba(255, 152, 0, 0.4)',
  },
};

class GannBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        const { x1, x2, yTop, yBottom, colors } = box;
        const w = x2 - x1;
        const h = yBottom - yTop;

        // Fill
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x1, yTop, w, h);

        // Border
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, yTop, w, h);

        // Horizontal grid lines (price subdivisions)
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 4]);
        for (const frac of SUBDIVISIONS) {
          const y = yTop + h * frac;
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
        }

        // Vertical grid lines (time subdivisions)
        for (const frac of SUBDIVISIONS) {
          const x = x1 + w * frac;
          ctx.beginPath();
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBottom);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Diagonal lines
        ctx.strokeStyle = colors.diagonal;
        ctx.lineWidth = 1;

        // 1x1 diagonal (corner to corner)
        ctx.beginPath();
        ctx.moveTo(x1, yBottom);
        ctx.lineTo(x2, yTop);
        ctx.stroke();

        // 2x1 diagonal (steeper — reaches top at midpoint of time)
        ctx.beginPath();
        ctx.moveTo(x1, yBottom);
        ctx.lineTo(x1 + w * 0.5, yTop);
        ctx.stroke();

        // 1x2 diagonal (shallower — reaches midpoint of price at end of time)
        ctx.beginPath();
        ctx.moveTo(x1, yBottom);
        ctx.lineTo(x2, yTop + h * 0.5);
        ctx.stroke();
      }
    });
  }
}

class GannBoxesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._gannBoxes.length === 0) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;

    const boxes = [];
    for (const gann of src._gannBoxes) {
      const x1 = timeScale.timeToCoordinate(gann.start_timestamp);
      const x2 = timeScale.timeToCoordinate(gann.end_timestamp);
      const yTop = series.priceToCoordinate(gann.high_price);
      const yBottom = series.priceToCoordinate(gann.low_price);

      if (x1 === null || x2 === null || yTop === null || yBottom === null) continue;

      boxes.push({
        x1,
        x2,
        yTop,
        yBottom,
        colors: COLORS[gann.direction] || COLORS.bullish,
      });
    }

    return new GannBoxesRenderer(boxes);
  }
}

export class GannBoxesPrimitive {
  constructor() {
    this._gannBoxes = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new GannBoxesPaneView(this);
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

  setBoxes(signals) {
    this._gannBoxes = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
