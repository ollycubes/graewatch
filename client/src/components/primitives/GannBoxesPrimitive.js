/**
 * Custom lightweight-charts v5 primitive that draws Gann boxes on the chart.
 *
 * Each box is a price/time rectangle with:
 *   - Bounding rectangle outline
 *   - Dashed midline separating premium (top half) from discount (bottom half)
 *   - Optional label in the top-left corner (used for BOS-derived boxes, e.g. "D")
 *
 * If end_timestamp is null the right edge extends to the visible chart boundary,
 * which is the correct behaviour for "live" BOS-anchored Gann boxes that need
 * to show where price currently sits within the premium/discount zone.
 */

const COLORS = {
  fill: 'rgba(150, 150, 150, 0.06)',
  border: 'rgba(150, 150, 150, 0.5)',
  midline: 'rgba(150, 150, 150, 0.4)',
  label: 'rgba(120, 120, 120, 0.75)',
};

class GannBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        const { x1, x2, yTop, yBottom, label } = box;
        const w = x2 - x1;
        const h = yBottom - yTop;
        const yMid = yTop + h * 0.5;

        ctx.fillStyle = COLORS.fill;
        ctx.fillRect(x1, yTop, w, h);

        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, yTop, w, h);

        // Premium / discount midline
        ctx.strokeStyle = COLORS.midline;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, yMid);
        ctx.lineTo(x2, yMid);
        ctx.stroke();
        ctx.setLineDash([]);

        // Optional source label (e.g. "D" for Daily BOS)
        if (label && Math.abs(h) > 14) {
          ctx.fillStyle = COLORS.label;
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(label, x1 + 4, yTop + 3);
        }
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
    if (!src._chart || !src._series || src._gannBoxes.length === 0) return null;

    const timeScale = src._chart.timeScale();
    const series = src._series;
    const visibleRange = timeScale.getVisibleLogicalRange();

    const boxes = [];
    for (const gann of src._gannBoxes) {
      const x1 = timeScale.timeToCoordinate(gann.start_timestamp);
      const yTop = series.priceToCoordinate(gann.high_price);
      const yBottom = series.priceToCoordinate(gann.low_price);

      if (x1 === null || yTop === null || yBottom === null) continue;

      // null end_timestamp → extend to visible right edge, OR to this._source._endTime
      let x2 = null;
      if (gann.end_timestamp != null) {
        x2 = timeScale.timeToCoordinate(gann.end_timestamp);
      } else if (src._endTime != null) {
        x2 = timeScale.timeToCoordinate(src._endTime);
      }

      if (x2 == null) {
        x2 = visibleRange ? timeScale.logicalToCoordinate(visibleRange.to) : x1 + 200;
      }
      if (x2 == null) x2 = x1 + 200;

      boxes.push({
        x1,
        x2,
        yTop: Math.min(yTop, yBottom),
        yBottom: Math.max(yTop, yBottom),
        label: gann.label ?? null,
      });
    }

    return new GannBoxesRenderer(boxes);
  }
}

export class GannBoxesPrimitive {
  constructor() {
    this._gannBoxes = [];
    this._endTime = null;
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
    if (this._requestUpdate) this._requestUpdate();
  }

  setEndTime(time) {
    this._endTime = time;
    if (this._requestUpdate) this._requestUpdate();
  }
}
