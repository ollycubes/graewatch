/**
 * Custom lightweight-charts v5 primitive that draws Wyckoff structures:
 *
 *   Trading range box  — shaded rectangle over the consolidation period
 *   Spring marker      — upward triangle below the wick (bullish entry)
 *   Upthrust marker    — downward triangle above the wick (bearish entry)
 *
 * Accumulation ranges are teal-tinted; distribution ranges are red-tinted;
 * unknown phase ranges are grey.
 */

const PHASE_COLORS = {
  accumulation: {
    fill: 'rgba(38, 166, 154, 0.07)',
    border: 'rgba(38, 166, 154, 0.35)',
    label: 'rgba(38, 166, 154, 0.70)',
  },
  distribution: {
    fill: 'rgba(239, 83, 80, 0.07)',
    border: 'rgba(239, 83, 80, 0.35)',
    label: 'rgba(239, 83, 80, 0.70)',
  },
  unknown: {
    fill: 'rgba(150, 150, 150, 0.06)',
    border: 'rgba(150, 150, 150, 0.30)',
    label: 'rgba(150, 150, 150, 0.60)',
  },
};

const MARKER_COLOR = {
  spring: '#26a69a',
  upthrust: '#ef5350',
};

class WyckoffRenderer {
  constructor(items) {
    this._items = items;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const item of this._items) {
        const { x1, x2, ySupport, yResistance, xMarker, yLevel, type, phase } = item;

        const colors = PHASE_COLORS[phase] || PHASE_COLORS.unknown;
        const boxTop = Math.min(ySupport, yResistance);
        const boxBot = Math.max(ySupport, yResistance);
        const boxH = boxBot - boxTop;
        const boxW = x2 - x1;

        // ── Range box ────────────────────────────────────────────────────────
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x1, boxTop, boxW, boxH);

        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(x1, boxTop, boxW, boxH);
        ctx.setLineDash([]);

        // Phase label (top-left corner of box)
        const phaseLabel =
          phase === 'accumulation' ? 'ACC' : phase === 'distribution' ? 'DIST' : 'RANGE';
        ctx.fillStyle = colors.label;
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(phaseLabel, x1 + 4, boxTop + 3);

        // ── Spring / Upthrust marker ──────────────────────────────────────────
        const markerColor = MARKER_COLOR[type] || '#888';
        const TRI = 5; // half-base of triangle in px

        ctx.fillStyle = markerColor;
        ctx.strokeStyle = markerColor;
        ctx.lineWidth = 1;

        if (type === 'spring') {
          // Upward-pointing triangle below the level
          const tipY = yLevel + TRI * 3;
          ctx.beginPath();
          ctx.moveTo(xMarker, tipY);
          ctx.lineTo(xMarker - TRI, tipY + TRI * 1.8);
          ctx.lineTo(xMarker + TRI, tipY + TRI * 1.8);
          ctx.closePath();
          ctx.fill();

          ctx.font = 'bold 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('SP', xMarker, tipY + TRI * 1.8 + 2);
        } else {
          // Downward-pointing triangle above the level
          const tipY = yLevel - TRI * 3;
          ctx.beginPath();
          ctx.moveTo(xMarker, tipY);
          ctx.lineTo(xMarker - TRI, tipY - TRI * 1.8);
          ctx.lineTo(xMarker + TRI, tipY - TRI * 1.8);
          ctx.closePath();
          ctx.fill();

          ctx.font = 'bold 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('UT', xMarker, tipY - TRI * 1.8 - 2);
        }
      }
    });
  }
}

class WyckoffPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'bottom';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._signals.length === 0) return null;

    const timeScale = src._chart.timeScale();
    const series = src._series;

    const items = [];
    for (const sig of src._signals) {
      const x1 = timeScale.timeToCoordinate(sig.range_start);
      const x2 = timeScale.timeToCoordinate(sig.timestamp);
      const ySupport = series.priceToCoordinate(sig.range_support);
      const yResistance = series.priceToCoordinate(sig.range_resistance);
      const xMarker = x2;
      const yLevel = series.priceToCoordinate(sig.level);

      if (
        x1 === null ||
        x2 === null ||
        ySupport === null ||
        yResistance === null ||
        yLevel === null
      ) {
        continue;
      }

      items.push({
        x1,
        x2,
        ySupport,
        yResistance,
        xMarker,
        yLevel,
        type: sig.type,
        phase: sig.phase,
      });
    }

    return items.length > 0 ? new WyckoffRenderer(items) : null;
  }
}

export class WyckoffPrimitive {
  constructor() {
    this._signals = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new WyckoffPaneView(this);
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

  setSignals(signals) {
    this._signals = signals;
    if (this._requestUpdate) this._requestUpdate();
  }
}
