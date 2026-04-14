/**
 * Custom lightweight-charts v5 primitive that draws a projected prediction
 * zone extending to the right of the last candle.
 *
 * Visual:
 *  - Semi-transparent gradient fill between target_high and target_low
 *  - Dashed border lines at target_high and target_low
 *  - Horizontal midline at current_close
 *  - Teal tint for bullish, red tint for bearish
 */

const COLORS = {
  bullish: {
    fill: 'rgba(38, 166, 154, 0.18)',
    border: 'rgba(38, 166, 154, 0.7)',
    mid: 'rgba(38, 166, 154, 0.5)',
  },
  bearish: {
    fill: 'rgba(239, 83, 80, 0.18)',
    border: 'rgba(239, 83, 80, 0.7)',
    mid: 'rgba(239, 83, 80, 0.5)',
  },
};

class PredictionZoneRenderer {
  constructor(zone) {
    this._zone = zone;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const z = this._zone;
      if (!z) return;

      const { x1, x2, yTop, yBottom, yMid, colors } = z;
      const w = x2 - x1;
      const h = yBottom - yTop;

      // Filled projection zone
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x1, yTop, w, h);

      // Dashed border lines at target_high and target_low
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);

      ctx.beginPath();
      ctx.moveTo(x1, yTop);
      ctx.lineTo(x2, yTop);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1, yBottom);
      ctx.lineTo(x2, yBottom);
      ctx.stroke();

      ctx.setLineDash([]);

      // Solid midline at current close
      ctx.strokeStyle = colors.mid;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, yMid);
      ctx.lineTo(x2, yMid);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = colors.border;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('PREDICTION', x2 - 4, yTop - 4);
    });
  }
}

class PredictionZonePaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'top';
  }

  renderer() {
    const src = this._source;
    if (
      !src._chart ||
      !src._series ||
      !src._prediction ||
      src._prediction.direction === 'neutral'
    ) {
      return null;
    }

    const timeScale = src._chart.timeScale();
    const series = src._series;
    const pred = src._prediction;

    const visibleRange = timeScale.getVisibleRange();
    if (!visibleRange) return null;

    // Start from the right edge of visible data, extend ~8% further right
    const x1 = timeScale.timeToCoordinate(visibleRange.to);
    if (x1 === null) return null;

    const chartWidth = src._chart.timeScale().width();
    const x2 = x1 + Math.max(chartWidth * 0.08, 40);

    const yTop = series.priceToCoordinate(pred.target_high);
    const yBottom = series.priceToCoordinate(pred.target_low);
    const yMid = series.priceToCoordinate(pred.current_close);

    if (yTop === null || yBottom === null || yMid === null) return null;

    const colors = pred.direction === 'bullish' ? COLORS.bullish : COLORS.bearish;

    return new PredictionZoneRenderer({
      x1,
      x2,
      yTop,
      yBottom,
      yMid,
      colors,
    });
  }
}

export class PredictionZonePrimitive {
  constructor() {
    this._prediction = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new PredictionZonePaneView(this);
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

  setPrediction(prediction) {
    this._prediction = prediction;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }
}
