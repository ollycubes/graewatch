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
        ctx.fillStyle = box.color;
        ctx.fillRect(box.x, box.y, box.width, box.height);
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
    const visibleRange = timeScale.getVisibleRange();

    const boxes = [];
    for (const fvg of src._fvgZones) {
      const x1 = timeScale.timeToCoordinate(fvg.timestamp);
      const yTop = series.priceToCoordinate(fvg.top);
      const yBottom = series.priceToCoordinate(fvg.bottom);

      if (x1 === null || yTop === null || yBottom === null) continue;

      // Extend rectangle to the right edge of visible area
      let x2;
      if (visibleRange) {
        x2 = timeScale.timeToCoordinate(visibleRange.to);
      }
      if (x2 === null || x2 === undefined) {
        x2 = x1 + 200;
      }

      const width = x2 - x1;
      const height = yBottom - yTop;

      boxes.push({
        x: x1,
        y: yTop,
        width,
        height,
        color:
          fvg.direction === 'bullish'
            ? 'rgba(38, 166, 154, 0.2)'
            : 'rgba(239, 83, 80, 0.2)',
      });
    }

    return new FVGBoxesRenderer(boxes);
  }
}

export class FVGBoxesPrimitive {
  constructor() {
    this._fvgZones = [];
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

  setZones(signals) {
    this._fvgZones = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
