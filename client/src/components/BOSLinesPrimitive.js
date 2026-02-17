/**
 * Custom lightweight-charts v5 primitive that draws BOS (Break of Structure)
 * horizontal lines from the swing point to the break candle.
 */

class BOSLinesRenderer {
  constructor(lines) {
    this._lines = lines;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const line of this._lines) {
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1;
        ctx.moveTo(line.x1, line.y);
        ctx.lineTo(line.x2, line.y);
        ctx.stroke();

        // Draw "BOS" label at midpoint, above bullish lines and below bearish lines
        ctx.fillStyle = line.color;
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textX = (line.x1 + line.x2) / 2;
        const labelY = line.direction === 'bearish' ? line.y + 10 : line.y - 10;
        ctx.fillText('BOS', textX, labelY);
      }
    });
  }
}

class BOSLinesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._bosLines.length === 0) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;

    const lines = [];
    for (const bos of src._bosLines) {
      const x1 = timeScale.timeToCoordinate(bos.swing_timestamp);
      const x2 = timeScale.timeToCoordinate(bos.timestamp);
      const y = series.priceToCoordinate(bos.swing_ref);

      if (x1 === null || x2 === null || y === null) continue;

      lines.push({
        x1,
        x2,
        y,
        direction: bos.direction,
        color: bos.direction === 'bearish' ? '#ef5350' : '#26a69a',
      });
    }

    return new BOSLinesRenderer(lines);
  }
}

export class BOSLinesPrimitive {
  constructor() {
    this._bosLines = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new BOSLinesPaneView(this);
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

  setLines(signals) {
    this._bosLines = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
