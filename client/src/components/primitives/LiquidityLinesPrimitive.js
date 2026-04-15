/**
 * Custom lightweight-charts v5 primitive that draws liquidity levels.
 *
 * Two visual modes based on the `swept` flag from the engine:
 *
 *   swept = true  — Taken liquidity: solid gold line from the swing origin
 *                   to the sweep candle, with an "×" centred on the line.
 *
 *   swept = false — Active liquidity: dashed gold line from the swing origin
 *                   extending to the visible right edge, with italic "liq" text.
 *
 * Pool levels (equal highs/lows clusters) use a slightly thicker line.
 */

const GOLD = '#c8981e';
const GOLD_FADED = 'rgba(200, 152, 30, 0.55)';

class LiquidityLinesRenderer {
  constructor(lines) {
    this._lines = lines;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const line of this._lines) {
        const lw = line.pool ? 2 : 1.5;

        if (line.swept) {
          // ── Taken liquidity: solid line + × marker ──────────────────────
          ctx.beginPath();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = lw;
          ctx.setLineDash([]);
          ctx.moveTo(line.x1, line.y);
          ctx.lineTo(line.x2, line.y);
          ctx.stroke();

          // "×" centred on the line
          const midX = (line.x1 + line.x2) / 2;
          ctx.fillStyle = GOLD;
          ctx.font = `bold 13px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('×', midX, line.y);
        } else {
          // ── Active liquidity: dashed line + italic "liq" label ──────────
          ctx.beginPath();
          ctx.strokeStyle = GOLD_FADED;
          ctx.lineWidth = lw;
          ctx.setLineDash([6, 4]);
          ctx.moveTo(line.x1, line.y);
          ctx.lineTo(line.x2, line.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Italic "liq" near the right end of the line
          ctx.fillStyle = GOLD;
          ctx.font = `italic bold 10px Arial`;
          ctx.textAlign = 'right';
          ctx.textBaseline = line.direction === 'bearish' ? 'bottom' : 'top';
          const offset = line.direction === 'bearish' ? -3 : 3;
          ctx.fillText('liq', line.x2 - 4, line.y + offset);
        }
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
    const visibleRange = timeScale.getVisibleRange();

    const lines = [];
    for (const liq of src._liqLines) {
      const x1 = timeScale.timeToCoordinate(liq.source_timestamp);
      const y = series.priceToCoordinate(liq.price);

      if (x1 === null || y === null) continue;

      let x2;
      if (liq.swept) {
        // End at the sweep candle
        x2 = timeScale.timeToCoordinate(liq.timestamp);
        if (x2 === null) continue;
      } else {
        // Extend to the visible right edge (or a safe fallback)
        x2 = visibleRange ? timeScale.timeToCoordinate(visibleRange.to) : null;
        if (x2 === null) x2 = x1 + 400;
      }

      lines.push({
        x1,
        x2,
        y,
        swept: liq.swept,
        direction: liq.direction,
        pool: liq.pool,
      });
    }

    return lines.length > 0 ? new LiquidityLinesRenderer(lines) : null;
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
