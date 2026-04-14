/**
 * Custom lightweight-charts v5 primitive that draws Gann boxes on the chart.
 *
 * Each Gann box is a rectangle between a swing high and swing low with:
 * - Bounding rectangle outline
 * - A horizontal midline separating premium (top half) and discount (bottom half) zones
 */

const COLORS = {
  fill: 'rgba(150, 150, 150, 0.06)',
  border: 'rgba(150, 150, 150, 0.5)',
  midline: 'rgba(150, 150, 150, 0.4)',
};

class GannBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        const { x1, x2, yTop, yBottom } = box;
        const w = x2 - x1;
        const h = yBottom - yTop;
        const yMid = yTop + h * 0.5;

        // Fill
        ctx.fillStyle = COLORS.fill;
        ctx.fillRect(x1, yTop, w, h);

        // Border
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, yTop, w, h);

        // Midline (premium/discount separator)
        ctx.strokeStyle = COLORS.midline;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yMid);
        ctx.lineTo(x2, yMid);
        ctx.stroke();
        ctx.setLineDash([]);
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
        direction: gann.direction,
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
