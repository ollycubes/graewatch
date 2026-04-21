/**
 * Custom lightweight-charts v5 primitive that draws FVG (Fair Value Gap)
 * zones as semi-transparent shaded rectangles on the chart.
 */

class FVGBoxesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this._boxes) {
        // Fill
        ctx.fillStyle = 'rgba(188, 210, 240, 0.40)';
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Thin border
        ctx.strokeStyle = 'rgba(140, 175, 220, 0.65)';
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // "FVG" label centred inside the box
        ctx.fillStyle = 'rgba(80, 110, 160, 0.80)';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FVG', box.x + box.width / 2, box.y + box.height / 2);
      }
    });
  }
}

class FVGBoxesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._fvgZones.length === 0) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;
    const visibleRange = timeScale.getVisibleLogicalRange();

    const boxes = [];
    for (const fvg of src._fvgZones) {
      const x1 = timeScale.timeToCoordinate(fvg.timestamp);
      const yTop = series.priceToCoordinate(fvg.top);
      const yBottom = series.priceToCoordinate(fvg.bottom);

      if (x1 === null || yTop === null || yBottom === null) continue;
      if (x1 < 0) continue; // formation candle off-screen left — skip to avoid bleeding from chart edge

      // End at mitigation candle, or extend to visible edge if unmitigated
      let x2 = null;
      if (fvg.end_timestamp) {
        x2 = timeScale.timeToCoordinate(fvg.end_timestamp);
      } else if (src._endTime) {
        x2 = timeScale.timeToCoordinate(src._endTime);
      } else {
        x2 = visibleRange ? timeScale.logicalToCoordinate(visibleRange.to) : null;
      }

      if (x2 === null || x2 === undefined) {
        x2 = x1 + 200;
      }

      if (x2 <= x1) continue;

      boxes.push({ x: x1, y: yTop, width: x2 - x1, height: yBottom - yTop });
    }

    return new FVGBoxesRenderer(boxes);
  }
}

export class FVGBoxesPrimitive {
  constructor() {
    this._fvgZones = [];
    this._endTime = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new FVGBoxesPaneView(this);
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
    this._fvgZones = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
