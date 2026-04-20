/**
 * Custom lightweight-charts v5 primitive that draws Order Block (OB)
 * zones as semi-transparent shaded rectangles on the chart.
 *
 * Visual style:
 *  - Bullish OB: teal fill with solid left border
 *  - Bearish OB: red fill with solid left border
 *  - Slightly higher opacity than FVG to distinguish them visually
 */

const COLORS = {
  fill: 'rgba(245, 222, 179, 0.45)',
  border: 'rgba(200, 170, 120, 0.70)',
  label: 'rgba(160, 130, 80, 0.85)',
};

class OBBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        // Filled rectangle
        ctx.fillStyle = COLORS.fill;
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Thin border outline
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // "OB" label centred inside the box
        ctx.fillStyle = COLORS.label;
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OB', box.x + box.width / 2, box.y + box.height / 2);
      }
    });
  }
}

class OBBoxesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._obZones.length === 0) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;
    const visibleRange = timeScale.getVisibleLogicalRange();

    const boxes = [];
    for (const ob of src._obZones) {
      const x1 = timeScale.timeToCoordinate(ob.timestamp);
      const yTop = series.priceToCoordinate(ob.top);
      const yBottom = series.priceToCoordinate(ob.bottom);

      if (x1 === null || yTop === null || yBottom === null) continue;

      // End at mitigation candle, or extend to visible edge if unmitigated
      let x2 = null;
      if (ob.end_timestamp) {
        x2 = timeScale.timeToCoordinate(ob.end_timestamp);
      } else if (src._endTime) {
        x2 = timeScale.timeToCoordinate(src._endTime);
      } else {
        x2 = visibleRange ? timeScale.logicalToCoordinate(visibleRange.to) : null;
      }

      if (x2 === null || x2 === undefined) {
        x2 = x1 + 200;
      }

      boxes.push({
        x: x1,
        y: yTop,
        width: x2 - x1,
        height: yBottom - yTop,
      });
    }

    return new OBBoxesRenderer(boxes);
  }
}

export class OBBoxesPrimitive {
  constructor() {
    this._obZones = [];
    this._endTime = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new OBBoxesPaneView(this);
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

  setEndTime(time) {
    this._endTime = time;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  setZones(signals) {
    this._obZones = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
