import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { BOSLinesPrimitive } from './primitives/BOSLinesPrimitive';
import { FVGBoxesPrimitive } from './primitives/FVGBoxesPrimitive';
import { GannBoxesPrimitive } from './primitives/GannBoxesPrimitive';
import { OBBoxesPrimitive } from './primitives/OBBoxesPrimitive';
import { LiquidityLinesPrimitive } from './primitives/LiquidityLinesPrimitive';
import { SetupPrimitive } from './primitives/SetupPrimitive';
import { SelectionBoxPrimitive } from './primitives/SelectionBoxPrimitive';
import { HTF_MAP } from '../context/dashboardStore';

function toChartTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input) {
    return null;
  }

  // Date-only (YYYY-MM-DD).
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return Math.floor(Date.parse(`${input}T00:00:00Z`) / 1000);
  }

  // TwelveData intraday format (YYYY-MM-DD HH:mm:ss) -> UTC ISO.
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?$/.test(input)) {
    const withSeconds = input.length === 16 ? `${input}:00` : input;
    return Math.floor(Date.parse(withSeconds.replace(' ', 'T') + 'Z') / 1000);
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
}

function normalizeBosSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      swing_timestamp: toChartTime(s.swing_timestamp),
      timestamp: toChartTime(s.timestamp),
    }))
    .filter((s) => s.swing_timestamp !== null && s.timestamp !== null);
}

function normalizeFvgSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      timestamp: toChartTime(s.timestamp),
      end_timestamp: s.end_timestamp ? toChartTime(s.end_timestamp) : null,
    }))
    .filter((s) => s.timestamp !== null);
}

function normalizeGannSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      start_timestamp: toChartTime(s.start_timestamp),
      end_timestamp: toChartTime(s.end_timestamp),
    }))
    .filter((s) => s.start_timestamp !== null && s.end_timestamp !== null);
}

function normalizeOBSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      timestamp: toChartTime(s.timestamp),
      end_timestamp: s.end_timestamp ? toChartTime(s.end_timestamp) : null,
    }))
    .filter((s) => s.timestamp !== null);
}

function normalizeLiqSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      source_timestamp: toChartTime(s.source_timestamp),
      timestamp: toChartTime(s.timestamp),
    }))
    .filter((s) => s.source_timestamp !== null && s.timestamp !== null);
}

function computeHTFBias(htfBosSignals, htfGannSignals, htfLatestClose) {
  // BOS bias: direction of the most recent signal
  let bosBias = null;
  if (htfBosSignals.length > 0) {
    bosBias = htfBosSignals[htfBosSignals.length - 1].direction;
  }

  // Gann bias: premium (above midpoint) = bearish, discount (below) = bullish
  let gannBias = null;
  if (htfGannSignals.length > 0 && htfLatestClose != null) {
    const latest = htfGannSignals[htfGannSignals.length - 1];
    const midpoint = (latest.high_price + latest.low_price) / 2;
    gannBias = htfLatestClose >= midpoint ? 'bearish' : 'bullish';
  }

  // Combined: agree → that direction, disagree → null, one exists → use it
  if (bosBias && gannBias) {
    return bosBias === gannBias ? bosBias : null;
  }
  return bosBias || gannBias;
}

function filterByBias(signals, bias) {
  if (!bias) return signals;
  return signals.filter((s) => s.direction === bias);
}

function CandlestickChart({ pair, interval, showBOS, showFVG, showGann, showOB, showLiq, selection, onSelectionChange }) {
  const [error, setError] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bosPrimitiveRef = useRef(null);
  const fvgPrimitiveRef = useRef(null);
  const gannPrimitiveRef = useRef(null);
  const obPrimitiveRef = useRef(null);
  const liqPrimitiveRef = useRef(null);
  const setupPrimitiveRef = useRef(null);
  const selectionPrimitiveRef = useRef(null);
  const candleDataRef = useRef([]);
  const bosDataRef = useRef([]);
  const fvgDataRef = useRef([]);
  const gannDataRef = useRef([]);
  const obDataRef = useRef([]);
  const liqDataRef = useRef([]);
  const htfBiasRef = useRef(null);
  const requestVersionRef = useRef(0);
  const showBOSRef = useRef(showBOS);
  const showFVGRef = useRef(showFVG);
  const showGannRef = useRef(showGann);
  const showOBRef = useRef(showOB);
  const showLiqRef = useRef(showLiq);
  // Selection drag state refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(null);

  useEffect(() => {
    showBOSRef.current = showBOS;
  }, [showBOS]);

  useEffect(() => {
    showFVGRef.current = showFVG;
  }, [showFVG]);

  useEffect(() => {
    showGannRef.current = showGann;
  }, [showGann]);

  useEffect(() => {
    showOBRef.current = showOB;
  }, [showOB]);

  useEffect(() => {
    showLiqRef.current = showLiq;
  }, [showLiq]);

  // Create the chart once on mount
  useEffect(() => {
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: 'solid', color: '#ffffff' },
        textColor: '#333333',
      },
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: '#3a3a4e',
        minBarSpacing: 3,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#90bff9',
      downColor: '#000000',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      wickUpColor: '#000000',
      wickDownColor: '#000000',
      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Attach primitives
    const bosPrimitive = new BOSLinesPrimitive();
    series.attachPrimitive(bosPrimitive);
    bosPrimitiveRef.current = bosPrimitive;

    const fvgPrimitive = new FVGBoxesPrimitive();
    series.attachPrimitive(fvgPrimitive);
    fvgPrimitiveRef.current = fvgPrimitive;

    const gannPrimitive = new GannBoxesPrimitive();
    series.attachPrimitive(gannPrimitive);
    gannPrimitiveRef.current = gannPrimitive;

    const obPrimitive = new OBBoxesPrimitive();
    series.attachPrimitive(obPrimitive);
    obPrimitiveRef.current = obPrimitive;

    const liqPrimitive = new LiquidityLinesPrimitive();
    series.attachPrimitive(liqPrimitive);
    liqPrimitiveRef.current = liqPrimitive;

    const setupPrimitive = new SetupPrimitive();
    series.attachPrimitive(setupPrimitive);
    setupPrimitiveRef.current = setupPrimitive;

    const selectionPrimitive = new SelectionBoxPrimitive();
    series.attachPrimitive(selectionPrimitive);
    selectionPrimitiveRef.current = selectionPrimitive;

    // Use ResizeObserver so the chart reflows when the container becomes
    // visible (intro→dashboard) or the sidebar changes the available width.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          chart.applyOptions({ width });
        }
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // Fetch and display data when pair or interval changes
  useEffect(() => {
    const abortController = new AbortController();
    const requestVersion = ++requestVersionRef.current;

    async function fetchData() {
      setError('');
      try {
        const response = await fetch(`/api/candles?pair=${pair}&interval=${interval}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Candles request failed: ${response.status}`);
        }
        const data = await response.json();

        // Ignore stale responses from old interval/pair requests.
        if (requestVersion !== requestVersionRef.current || abortController.signal.aborted) {
          return;
        }

        if (data.candles && seriesRef.current) {
          const formatted = data.candles
            .map((c) => ({
              time: toChartTime(c.timestamp),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
            .filter((c) => c.time !== null);

          seriesRef.current.setData(formatted);
          candleDataRef.current = formatted;

          // When a selection is active, lock the chart view to the selected
          // time period so top-down analysis stays focused on the same window
          // across all timeframes (weekly → daily → 4h → 1h → 15min).
          // A small 10% gutter on each side keeps the selection box from
          // touching the chart edges. Without a selection, show all data.
          if (selection && selection.start && selection.end) {
            const startTs = toChartTime(selection.start);
            const endTs = toChartTime(selection.end);
            if (startTs !== null && endTs !== null && formatted.length > 0) {
              const span = Math.max(endTs - startTs, 3600);
              const gutter = span * 0.1;
              const firstTs = formatted[0].time;
              const lastTs = formatted[formatted.length - 1].time;
              chartRef.current.timeScale().setVisibleRange({
                from: Math.max(startTs - gutter, firstTs),
                to: Math.min(endTs + gutter, lastTs),
              });
            } else {
              chartRef.current.timeScale().fitContent();
            }
          } else {
            chartRef.current.timeScale().fitContent();
          }

          // Build range params when a selection is active
          let rangeParams = '';
          if (selection) {
            rangeParams = `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
          }

          // Fetch current-TF analysis signals in parallel.
          const fetchPromises = [
            fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/analysis/gann?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/analysis/orderblocks?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/analysis/liquidity?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
          ];

          // If there's a higher timeframe, also fetch HTF BOS, Gann, and candles for bias.
          const htfInterval = HTF_MAP[interval] || null;
          if (htfInterval) {
            fetchPromises.push(
              fetch(`/api/analysis/bos?pair=${pair}&interval=${htfInterval}`, {
                signal: abortController.signal,
              }),
              fetch(`/api/analysis/gann?pair=${pair}&interval=${htfInterval}`, {
                signal: abortController.signal,
              }),
              fetch(`/api/candles?pair=${pair}&interval=${htfInterval}`, {
                signal: abortController.signal,
              }),
            );
          }

          const results = await Promise.allSettled(fetchPromises);

          if (requestVersion !== requestVersionRef.current || abortController.signal.aborted) {
            return;
          }

          const [bosResult, fvgResult, gannResult, obResult, liqResult] = results;

          if (bosResult.status === 'fulfilled' && bosResult.value.ok) {
            const bosData = await bosResult.value.json();
            bosDataRef.current = normalizeBosSignals(bosData.signals || []);
          } else {
            bosDataRef.current = [];
          }

          if (fvgResult.status === 'fulfilled' && fvgResult.value.ok) {
            const fvgData = await fvgResult.value.json();
            fvgDataRef.current = normalizeFvgSignals(fvgData.signals || []);
          } else {
            fvgDataRef.current = [];
          }

          if (gannResult.status === 'fulfilled' && gannResult.value.ok) {
            const gannData = await gannResult.value.json();
            gannDataRef.current = normalizeGannSignals(gannData.signals || []);
          } else {
            gannDataRef.current = [];
          }

          if (obResult.status === 'fulfilled' && obResult.value.ok) {
            const obData = await obResult.value.json();
            obDataRef.current = normalizeOBSignals(obData.signals || []);
          } else {
            obDataRef.current = [];
          }

          if (liqResult.status === 'fulfilled' && liqResult.value.ok) {
            const liqData = await liqResult.value.json();
            liqDataRef.current = normalizeLiqSignals(liqData.signals || []);
          } else {
            liqDataRef.current = [];
          }

          // Compute HTF bias if a higher timeframe was fetched.
          htfBiasRef.current = null;
          if (htfInterval) {
            const [htfBosResult, htfGannResult, htfCandlesResult] = results.slice(5);
            let htfBosSignals = [];
            let htfGannSignals = [];
            let htfLatestClose = null;

            if (htfBosResult.status === 'fulfilled' && htfBosResult.value.ok) {
              const d = await htfBosResult.value.json();
              htfBosSignals = d.signals || [];
            }
            if (htfGannResult.status === 'fulfilled' && htfGannResult.value.ok) {
              const d = await htfGannResult.value.json();
              htfGannSignals = d.signals || [];
            }
            if (htfCandlesResult.status === 'fulfilled' && htfCandlesResult.value.ok) {
              const d = await htfCandlesResult.value.json();
              const candles = d.candles || [];
              if (candles.length > 0) {
                htfLatestClose = candles[candles.length - 1].close;
              }
            }

            htfBiasRef.current = computeHTFBias(htfBosSignals, htfGannSignals, htfLatestClose);
          }

          const bias = htfBiasRef.current;
          if (bosPrimitiveRef.current) {
            bosPrimitiveRef.current.setLines(
              showBOSRef.current ? filterByBias(bosDataRef.current, bias) : [],
            );
          }
          if (fvgPrimitiveRef.current) {
            fvgPrimitiveRef.current.setZones(
              showFVGRef.current ? filterByBias(fvgDataRef.current, bias) : [],
            );
          }
          if (gannPrimitiveRef.current) {
            gannPrimitiveRef.current.setBoxes(
              showGannRef.current ? filterByBias(gannDataRef.current, bias) : [],
            );
          }
          if (obPrimitiveRef.current) {
            obPrimitiveRef.current.setZones(
              showOBRef.current ? filterByBias(obDataRef.current, bias) : [],
            );
          }
          if (liqPrimitiveRef.current) {
            liqPrimitiveRef.current.setLines(
              showLiqRef.current ? filterByBias(liqDataRef.current, bias) : [],
            );
          }

          // Fetch setup only when a selection is active
          if (selection && rangeParams) {
            try {
              const setupRes = await fetch(
                `/api/setup?pair=${pair}&interval=${interval}${rangeParams}`,
                { signal: abortController.signal },
              );
              if (setupRes.ok && setupPrimitiveRef.current) {
                const setupData = await setupRes.json();
                setupPrimitiveRef.current.setSetup(setupData);
              }
            } catch (setupErr) {
              if (setupErr?.name !== 'AbortError') {
                // Setup is non-critical — silently ignore errors
              }
            }
          } else if (setupPrimitiveRef.current) {
            // No selection — clear any stale setup overlay
            setupPrimitiveRef.current.clear();
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        setError('Failed to load chart data. Check that the server is running.');
      }
    }

    fetchData();

    return () => {
      abortController.abort();
    };
  }, [pair, interval, selection]);

  // Toggle overlays without re-fetching (apply HTF bias filter)
  useEffect(() => {
    if (bosPrimitiveRef.current) {
      bosPrimitiveRef.current.setLines(
        showBOS ? filterByBias(bosDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showBOS]);

  useEffect(() => {
    if (fvgPrimitiveRef.current) {
      fvgPrimitiveRef.current.setZones(
        showFVG ? filterByBias(fvgDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showFVG]);

  useEffect(() => {
    if (gannPrimitiveRef.current) {
      gannPrimitiveRef.current.setBoxes(
        showGann ? filterByBias(gannDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showGann]);

  useEffect(() => {
    if (obPrimitiveRef.current) {
      obPrimitiveRef.current.setZones(
        showOB ? filterByBias(obDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showOB]);

  useEffect(() => {
    if (liqPrimitiveRef.current) {
      liqPrimitiveRef.current.setLines(
        showLiq ? filterByBias(liqDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showLiq]);

  // ── Selection mode mouse handlers ─────────────────────────────────────
  // When the user drags beyond visible candle data, coordinateToTime()
  // returns null. This helper clamps to the first/last candle so the
  // selection always registers.
  const clampTime = useCallback((rawTime, x) => {
    if (rawTime != null) return rawTime;
    const candles = candleDataRef.current;
    if (candles.length === 0) return null;
    // If the pixel x is near the left edge, clamp to the first candle;
    // otherwise clamp to the last.
    const container = chartContainerRef.current;
    if (!container) return null;
    const midX = container.clientWidth / 2;
    return x < midX ? candles[0].time : candles[candles.length - 1].time;
  }, []);

  const clampPrice = useCallback((rawPrice, y) => {
    if (rawPrice != null) return rawPrice;
    const candles = candleDataRef.current;
    if (candles.length === 0) return null;
    // Clamp to the overall high/low of the data
    const container = chartContainerRef.current;
    if (!container) return null;
    const midY = container.clientHeight / 2;
    const allHighs = candles.map((c) => c.high);
    const allLows = candles.map((c) => c.low);
    return y < midY ? Math.max(...allHighs) : Math.min(...allLows);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!isSelecting || !chartRef.current || !seriesRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    isDraggingRef.current = true;
    dragStartRef.current = { x, y };
  }, [isSelecting]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || !chartRef.current || !seriesRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const start = dragStartRef.current;

    const timeScale = chartRef.current.timeScale();
    const series = seriesRef.current;

    const t1 = clampTime(timeScale.coordinateToTime(start.x), start.x);
    const t2 = clampTime(timeScale.coordinateToTime(x), x);
    const p1 = clampPrice(series.coordinateToPrice(start.y), start.y);
    const p2 = clampPrice(series.coordinateToPrice(y), y);

    if (t1 != null && t2 != null && p1 != null && p2 != null) {
      selectionPrimitiveRef.current?.setSelection({
        startTime: Math.min(t1, t2),
        endTime: Math.max(t1, t2),
        highPrice: Math.max(p1, p2),
        lowPrice: Math.min(p1, p2),
        candleCount: null, // computed on mouseup
      });
    }
  }, [clampTime, clampPrice]);

  const handleMouseUp = useCallback((e) => {
    if (!isDraggingRef.current || !chartRef.current || !seriesRef.current) return;
    isDraggingRef.current = false;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const start = dragStartRef.current;

    const timeScale = chartRef.current.timeScale();
    const series = seriesRef.current;

    const t1 = clampTime(timeScale.coordinateToTime(start.x), start.x);
    const t2 = clampTime(timeScale.coordinateToTime(x), x);
    const p1 = clampPrice(series.coordinateToPrice(start.y), start.y);
    const p2 = clampPrice(series.coordinateToPrice(y), y);

    if (t1 != null && t2 != null && p1 != null && p2 != null) {
      const startTime = Math.min(t1, t2);
      const endTime = Math.max(t1, t2);

      // Count candles within the time range
      const candlesInRange = candleDataRef.current.filter(
        (c) => c.time >= startTime && c.time <= endTime,
      );

      selectionPrimitiveRef.current?.setSelection({
        startTime,
        endTime,
        highPrice: Math.max(p1, p2),
        lowPrice: Math.min(p1, p2),
        candleCount: candlesInRange.length,
      });

      // Convert timestamps to ISO strings for the backend
      const startDate = new Date(startTime * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const endDate = new Date(endTime * 1000).toISOString().slice(0, 19).replace('T', ' ');

      if (onSelectionChange) {
        onSelectionChange({ start: startDate, end: endDate });
      }
    }

    setIsSelecting(false);
  }, [onSelectionChange, clampTime, clampPrice]);

  // Attach/detach mouse listeners when selection mode changes
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    if (isSelecting) {
      // Disable chart scrolling/scaling during selection
      chartRef.current?.applyOptions({
        handleScroll: false,
        handleScale: false,
      });
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseup', handleMouseUp);
    } else {
      // Re-enable chart interaction
      chartRef.current?.applyOptions({
        handleScroll: true,
        handleScale: true,
      });
    }

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, handleMouseDown, handleMouseMove, handleMouseUp]);

  // Sync external selection clear
  useEffect(() => {
    if (!selection && selectionPrimitiveRef.current) {
      selectionPrimitiveRef.current.clear();
    }
  }, [selection]);

  const handleClearSelection = useCallback(() => {
    selectionPrimitiveRef.current?.clear();
    if (onSelectionChange) {
      onSelectionChange(null);
    }
  }, [onSelectionChange]);

  return (
    <div style={{ width: '100%' }}>
      {error && <p className="chart-error">{error}</p>}
      <div
        ref={chartContainerRef}
        className={isSelecting ? 'chart-container chart-container--selecting' : 'chart-container'}
        style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}
      />
      <div className="chart-toolbar">
        <button
          className={`chart-toolbar__btn ${isSelecting ? 'chart-toolbar__btn--active' : ''}`}
          onClick={() => setIsSelecting(!isSelecting)}
          title="Draw selection box"
        >
          ⬚ Select
        </button>
        {selection && (
          <>
            <button
              className="chart-toolbar__btn chart-toolbar__btn--clear"
              onClick={handleClearSelection}
              title="Clear selection"
            >
              ✕ Clear
            </button>
            <span className="chart-toolbar__label">Selection active</span>
          </>
        )}
      </div>
    </div>
  );
}

export default CandlestickChart;
