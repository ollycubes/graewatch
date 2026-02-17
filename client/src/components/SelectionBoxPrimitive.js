/**
 * Custom lightweight-charts v5 primitive that draws a dashed selection
 * rectangle representing the user's analysis region.
 */

class SelectionBoxRenderer {
  constructor(box) {
    this._box = box;
  }

  draw(target) {
    const box = this._box;
    if (!box) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      // Semi-transparent fill
      ctx.fillStyle = 'rgba(100, 149, 237, 0.08)';
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // Dashed border
      ctx.strokeStyle = 'rgba(100, 149, 237, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);
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
    if (!src._chart || !src._series) return null;

    // Support both pixel-based (during drag) and data-based (after commit) rendering
    if (src._pixelBox) {
      return new SelectionBoxRenderer(src._pixelBox);
    }

    const region = src._region;
    if (!region) return null;

    const timeScale = src._chart.timeScale();
    const series = src._series;

    const x1 = timeScale.timeToCoordinate(region.startTime);
    const x2 = timeScale.timeToCoordinate(region.endTime);
    const y1 = series.priceToCoordinate(region.topPrice);
    const y2 = series.priceToCoordinate(region.bottomPrice);

    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;

    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);

    return new SelectionBoxRenderer({
      x: xMin,
      y: yMin,
      width: xMax - xMin,
      height: yMax - yMin,
    });
  }
}

export class SelectionBoxPrimitive {
  constructor() {
    this._region = null;
    this._pixelBox = null;
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

  // Set pixel-based box during drag (before committing to data coords)
  setPixelBox(box) {
    this._pixelBox = box;
    this._region = null;
    if (this._requestUpdate) this._requestUpdate();
  }

  // Set data-based region after drag completes
  setRegion(region) {
    this._region = region;
    this._pixelBox = null;
    if (this._requestUpdate) this._requestUpdate();
  }

  clear() {
    this._region = null;
    this._pixelBox = null;
    if (this._requestUpdate) this._requestUpdate();
  }
}
