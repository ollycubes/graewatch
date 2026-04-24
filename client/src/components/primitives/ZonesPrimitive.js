/**
 * Renders top-N scored zones from /api/zones as amber highlighted boxes.
 *
 * Zones are drawn above OB/FVG boxes (zOrder: 'normal') so they are always
 * visible.  Rank 1 is the most opaque; each subsequent rank fades slightly.
 * Each box shows a "#rank · score" label.
 */

const FILL_ALPHA = [0.28, 0.18, 0.12];
const BORDER_ALPHA = [0.85, 0.6, 0.4];
const BASE_FILL = '214, 160, 50'; // amber
const BASE_BORDER = '180, 120, 20'; // dark amber

class ZonesRenderer {
  constructor(boxes) {
    this._boxes = boxes;
  }

  draw(target) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      this._boxes.forEach((box, i) => {
        const fa = FILL_ALPHA[i] ?? FILL_ALPHA[FILL_ALPHA.length - 1];
        const ba = BORDER_ALPHA[i] ?? BORDER_ALPHA[BORDER_ALPHA.length - 1];

        ctx.fillStyle = `rgba(${BASE_FILL}, ${fa})`;
        ctx.fillRect(box.x, box.y, box.width, box.height);

        ctx.strokeStyle = `rgba(${BASE_BORDER}, ${ba})`;
        ctx.lineWidth = i === 0 ? 2 : 1;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Score label — only draw when box is tall enough to fit text
        if (Math.abs(box.height) > 10) {
          ctx.fillStyle = `rgba(${BASE_BORDER}, ${ba})`;
          ctx.font = `${i === 0 ? 'bold ' : ''}10px Arial`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(box.label, box.x + 4, box.y + box.height / 2);
        }
      });
    });
  }
}

class ZonesPaneView {
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return 'normal';
  }

  renderer() {
    const src = this._source;
    if (!src._chart || !src._series || src._zones.length === 0) return null;

    const timeScale = src._chart.timeScale();
    const series = src._series;
    const visibleRange = timeScale.getVisibleLogicalRange();

    const boxes = [];
    for (const zone of src._zones) {
      const x1 = timeScale.timeToCoordinate(zone.timestamp);
      const yTop = series.priceToCoordinate(zone.top);
      const yBottom = series.priceToCoordinate(zone.bottom);

      if (x1 === null || yTop === null || yBottom === null) continue;

      let x2 = null;
      if (zone.end_timestamp) {
        x2 = timeScale.timeToCoordinate(zone.end_timestamp);
      } else if (src._endTime) {
        x2 = timeScale.timeToCoordinate(src._endTime);
      } else {
        x2 = visibleRange ? timeScale.logicalToCoordinate(visibleRange.to) : null;
      }

      if (x2 === null || x2 === undefined) {
        x2 = x1 + 200;
      }

      const rank = boxes.length + 1;
      const label = `#${rank} · ${zone.score}`;

      boxes.push({
        x: x1,
        y: yTop,
        width: x2 - x1,
        height: yBottom - yTop,
        label,
      });
    }

    return new ZonesRenderer(boxes);
  }
}

export class ZonesPrimitive {
  constructor() {
    this._zones = [];
    this._endTime = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneView = new ZonesPaneView(this);
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

  setZones(zones) {
    this._zones = zones;
    if (this._requestUpdate) this._requestUpdate();
  }

  clear() {
    this.setZones([]);
  }
}
