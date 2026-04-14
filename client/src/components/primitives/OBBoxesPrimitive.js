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
  bullishFill: 'rgba(38, 166, 154, 0.28)',
  bullishBorder: 'rgba(38, 166, 154, 0.8)',
  bearishFill: 'rgba(239, 83, 80, 0.28)',
  bearishBorder: 'rgba(239, 83, 80, 0.8)',
};

class OBBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        // Filled rectangle
        ctx.fillStyle = box.fillColor;
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Solid left border line to mark the OB origin
        ctx.strokeStyle = box.borderColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(box.x, box.y);
        ctx.lineTo(box.x, box.y + box.height);
        ctx.stroke();

        // "OB" label near the left border
        ctx.fillStyle = box.borderColor;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('OB', box.x + 4, box.y + 3);
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
    const visibleRange = timeScale.getVisibleRange();

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
      }
      if (x2 === null || x2 === undefined) {
        x2 = visibleRange ? timeScale.timeToCoordinate(visibleRange.to) : null;
      }
      if (x2 === null || x2 === undefined) {
        x2 = x1 + 200;
      }

      const isBullish = ob.direction === 'bullish';

      boxes.push({
        x: x1,
        y: yTop,
        width: x2 - x1,
        height: yBottom - yTop,
        fillColor: isBullish ? COLORS.bullishFill : COLORS.bearishFill,
        borderColor: isBullish ? COLORS.bullishBorder : COLORS.bearishBorder,
      });
    }

    return new OBBoxesRenderer(boxes);
  }
}

export class OBBoxesPrimitive {
  constructor() {
    this._obZones = [];
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

  setZones(signals) {
    this._obZones = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
