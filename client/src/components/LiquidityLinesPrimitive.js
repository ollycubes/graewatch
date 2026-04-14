/**
 * Custom lightweight-charts v5 primitive that draws liquidity sweep lines.
 *
 * Each sweep is a horizontal dashed line from the source swing to the sweep
 * candle at the swept price level. Pool sweeps (equal highs/lows) are drawn
 * with a thicker line. A "liq" or "liq pool" label is placed at the midpoint.
 */

class LiquidityLinesRenderer {
  constructor(lines) {
    this._lines = lines;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const line of this._lines) {
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.pool ? 2 : 1;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(line.x1, line.y);
        ctx.lineTo(line.x2, line.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label at midpoint
        ctx.fillStyle = line.color;
        ctx.font = 'italic 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textX = (line.x1 + line.x2) / 2;
        const labelY = line.direction === 'bearish' ? line.y + 10 : line.y - 10;
        ctx.fillText(line.pool ? 'liq pool' : 'liq', textX, labelY);
      }
    });
  }
}

class LiquidityLinesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._liqLines.length === 0) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;

    const lines = [];
    for (const liq of src._liqLines) {
      const x1 = timeScale.timeToCoordinate(liq.source_timestamp);
      const x2 = timeScale.timeToCoordinate(liq.timestamp);
      const y = series.priceToCoordinate(liq.price);

      if (x1 === null || x2 === null || y === null) continue;

      lines.push({
        x1,
        x2,
        y,
        direction: liq.direction,
        pool: liq.pool,
        color: liq.direction === 'bullish' ? '#26a69a' : '#ef5350',
      });
    }

    return new LiquidityLinesRenderer(lines);
  }
}

export class LiquidityLinesPrimitive {
  constructor() {
    this._liqLines = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new LiquidityLinesPaneView(this);
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
    this._liqLines = signals;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
