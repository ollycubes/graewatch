import { useEffect, useRef, useState, useCallback } from 'react';
import content from '../content.json';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { BOSLinesPrimitive } from './primitives/BOSLinesPrimitive';
import { FVGBoxesPrimitive } from './primitives/FVGBoxesPrimitive';
import { GannBoxesPrimitive } from './primitives/GannBoxesPrimitive';
import { OBBoxesPrimitive } from './primitives/OBBoxesPrimitive';
import { LiquidityLinesPrimitive } from './primitives/LiquidityLinesPrimitive';
import { WyckoffPrimitive } from './primitives/WyckoffPrimitive';
import { SetupPrimitive } from './primitives/SetupPrimitive';
import { ZonesPrimitive } from './primitives/ZonesPrimitive';
import { SelectionBoxPrimitive } from './primitives/SelectionBoxPrimitive';
import { HTF_MAP } from '../context/dashboardStore';

const { chart: CHART } = content;

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

function normalizeZoneSignals(zones) {
  return zones
    .map((z) => ({
      ...z,
      timestamp: toChartTime(z.timestamp),
      end_timestamp: z.end_timestamp ? toChartTime(z.end_timestamp) : null,
    }))
    .filter((z) => z.timestamp !== null);
}

function normalizeWyckoffSignals(signals) {
  return signals
    .map((s) => ({
      ...s,
      timestamp: toChartTime(s.timestamp),
      range_start: toChartTime(s.range_start),
      range_end: toChartTime(s.range_end),
    }))
    .filter((s) => s.timestamp !== null && s.range_start !== null);
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

// Convert normalized daily BOS signals into Gann boxes anchored to each BOS:
//   start  = the swing that was broken  (swing_timestamp / swing_ref)
//   end    = null → extends to the visible chart right edge
//   height = range between the broken swing and the BOS close
// This matches the checklist instruction: "Anchor the Gannbox from the swing
// that caused the most recent daily BOS to the swing that was broken."
function deriveGannFromBos(normalizedBosSignals, bias) {
  return normalizedBosSignals
    .filter((s) => !bias || s.direction === bias)
    .map((s) => ({
      start_timestamp: s.swing_timestamp, // already chart-time number
      end_timestamp: null, // extend to visible right edge
      high_price: Math.max(s.price, s.swing_ref),
      low_price: Math.min(s.price, s.swing_ref),
      direction: s.direction,
      label: 'D', // "Daily BOS" source marker
    }))
    .filter((s) => s.start_timestamp != null);
}

function CandlestickChart({
  pair,
  interval,
  showBOS,
  showFVG,
  showGann,
  showOB,
  showLiq,
  showWyckoff,
  selection,
  onSelectionChange,
  toolbarExtras,
  onScreenshotRef,
}) {
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
  const wyckoffPrimitiveRef = useRef(null);
  const setupPrimitiveRef = useRef(null);
  const zonesPrimitiveRef = useRef(null);
  const selectionPrimitiveRef = useRef(null);
  const candleDataRef = useRef([]);
  const bosDataRef = useRef([]);
  const fvgDataRef = useRef([]);
  const gannDataRef = useRef([]);
  const obDataRef = useRef([]);
  const liqDataRef = useRef([]);
  const wyckoffDataRef = useRef([]);
  const htfBiasRef = useRef(null);
  const htfBosDataRef = useRef([]); // daily BOS signals (pre-normalized) for 4H Gann derivation
  const intervalRef = useRef(interval); // kept in sync so Gann toggle can read current interval
  const requestVersionRef = useRef(0);
  const showBOSRef = useRef(showBOS);
  const showFVGRef = useRef(showFVG);
  const showGannRef = useRef(showGann);
  const showOBRef = useRef(showOB);
  const showLiqRef = useRef(showLiq);
  const showWyckoffRef = useRef(showWyckoff);
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
    intervalRef.current = interval;
  }, [interval]);

  useEffect(() => {
    showOBRef.current = showOB;
  }, [showOB]);

  useEffect(() => {
    showLiqRef.current = showLiq;
  }, [showLiq]);

  useEffect(() => {
    showWyckoffRef.current = showWyckoff;
  }, [showWyckoff]);

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

    if (onScreenshotRef) {
      onScreenshotRef.current = () => chart.takeScreenshot().toDataURL('image/png');
    }

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

    const wyckoffPrimitive = new WyckoffPrimitive();
    series.attachPrimitive(wyckoffPrimitive);
    wyckoffPrimitiveRef.current = wyckoffPrimitive;

    const setupPrimitive = new SetupPrimitive();
    series.attachPrimitive(setupPrimitive);
    setupPrimitiveRef.current = setupPrimitive;

    const zonesPrimitive = new ZonesPrimitive();
    series.attachPrimitive(zonesPrimitive);
    zonesPrimitiveRef.current = zonesPrimitive;

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

      if (bosPrimitiveRef.current) {
        bosDataRef.current = [];
        bosPrimitiveRef.current.setLines([]);
      }
      if (fvgPrimitiveRef.current) {
        fvgDataRef.current = [];
        fvgPrimitiveRef.current.setZones([]);
      }
      if (gannPrimitiveRef.current) {
        gannDataRef.current = [];
        gannPrimitiveRef.current.setBoxes([]);
      }
      if (obPrimitiveRef.current) {
        obDataRef.current = [];
        obPrimitiveRef.current.setZones([]);
      }
      if (liqPrimitiveRef.current) {
        liqDataRef.current = [];
        liqPrimitiveRef.current.setLines([]);
      }
      if (wyckoffPrimitiveRef.current) {
        wyckoffDataRef.current = [];
        wyckoffPrimitiveRef.current.setSignals([]);
      }
      if (zonesPrimitiveRef.current) {
        zonesPrimitiveRef.current.setZones([]);
      }
      if (setupPrimitiveRef.current) {
        setupPrimitiveRef.current.clear();
      }

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

          const timeScale = chartRef.current.timeScale();
          const oldLogicalRange = timeScale.getVisibleLogicalRange();

          let visibleStartTime = null;
          let visibleEndTime = null;

          if (oldLogicalRange && candleDataRef.current && candleDataRef.current.length > 0) {
            const oldData = candleDataRef.current;
            const fromIdx = Math.max(0, Math.floor(oldLogicalRange.from));
            const toIdx = Math.min(oldData.length - 1, Math.ceil(oldLogicalRange.to));
            if (oldData[fromIdx]) visibleStartTime = oldData[fromIdx].time;
            if (oldData[toIdx]) visibleEndTime = oldData[toIdx].time;
          }

          seriesRef.current.setData(formatted);
          candleDataRef.current = formatted;

          let newLogicalRange = null;

          if (selection && selection.start && selection.end) {
            const startT = toChartTime(selection.start);
            const endT = toChartTime(selection.end);

            let minIdx = formatted.findIndex((c) => c.time >= startT);
            let maxIdx = formatted.findLastIndex((c) => c.time <= endT);

            if (minIdx !== -1 && maxIdx !== -1 && minIdx <= maxIdx) {
              const padding = Math.max(10, Math.floor((maxIdx - minIdx) * 0.2));
              newLogicalRange = {
                from: Math.max(0, minIdx - padding),
                to: Math.min(formatted.length - 1, maxIdx + padding),
              };
            }
          } else if (visibleStartTime !== null && visibleEndTime !== null) {
            let minIdx = formatted.findIndex((c) => c.time >= visibleStartTime);
            let maxIdx = formatted.findLastIndex((c) => c.time <= visibleEndTime);

            if (minIdx === -1) minIdx = 0;
            if (maxIdx === -1) maxIdx = formatted.length - 1;

            if (minIdx <= maxIdx) {
              newLogicalRange = { from: minIdx, to: maxIdx };
            }
          }

          if (newLogicalRange) {
            timeScale.setVisibleLogicalRange(newLogicalRange);
          }

          if (selection && selection.start && selection.end) {
            // Update the selection box's candle count for the new interval
            // so the badge stays accurate as you step through timeframes.
            if (selectionPrimitiveRef.current?._selection) {
              const { startTime, endTime } = selectionPrimitiveRef.current._selection;
              const candlesInRange = formatted.filter(
                (c) => c.time >= startTime && c.time <= endTime,
              );
              selectionPrimitiveRef.current.setSelection({
                ...selectionPrimitiveRef.current._selection,
                candleCount: candlesInRange.length,
              });
            }
          }

          // Build range params when a selection is active
          let rangeParams = '';
          if (selection) {
            rangeParams = `&start=${encodeURIComponent(selection.start)}&end=${encodeURIComponent(selection.end)}`;
          }

          // Fetch current-TF analysis signals in parallel.
          // Indices: 0=bos, 1=fvg, 2=gann, 3=ob, 4=liq, 5=wyckoff, 6+=HTF
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
            fetch(`/api/analysis/wyckoff?pair=${pair}&interval=${interval}${rangeParams}`, {
              signal: abortController.signal,
            }),
          ];

          // If there's a higher timeframe, also fetch HTF BOS, Gann, and candles for bias.
          const htfInterval = HTF_MAP[interval] || null;
          if (htfInterval) {
            fetchPromises.push(
              fetch(`/api/analysis/bos?pair=${pair}&interval=${htfInterval}${rangeParams}`, {
                signal: abortController.signal,
              }),
              fetch(`/api/analysis/gann?pair=${pair}&interval=${htfInterval}${rangeParams}`, {
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

          const wyckoffResult = results[5];
          if (wyckoffResult && wyckoffResult.status === 'fulfilled' && wyckoffResult.value.ok) {
            const wyckoffData = await wyckoffResult.value.json();
            wyckoffDataRef.current = normalizeWyckoffSignals(wyckoffData.signals || []);
          } else {
            wyckoffDataRef.current = [];
          }

          // Compute HTF bias if a higher timeframe was fetched.
          htfBiasRef.current = null;
          if (htfInterval) {
            const [htfBosResult, htfGannResult, htfCandlesResult] = results.slice(6);
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
            // Store normalized HTF BOS so the Gann toggle effect can derive
            // boxes without re-fetching when on 4H.
            htfBosDataRef.current = normalizeBosSignals(htfBosSignals);
          } else {
            htfBosDataRef.current = [];
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
            // On 4H: show Gann boxes derived from Daily BOS (confluence-anchored).
            // On all other intervals: show the native Gann boxes for that TF.
            const gannBoxes =
              interval === '4h' && htfBosDataRef.current.length > 0
                ? deriveGannFromBos(htfBosDataRef.current, bias)
                : filterByBias(gannDataRef.current, bias);
            gannPrimitiveRef.current.setBoxes(showGannRef.current ? gannBoxes : []);
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
          if (wyckoffPrimitiveRef.current) {
            wyckoffPrimitiveRef.current.setSignals(
              showWyckoffRef.current ? filterByBias(wyckoffDataRef.current, bias) : [],
            );
          }

          // Fetch setup + zones only when a selection is active
          // We intentionally fetch these using the 15min entry timeframe so that the
          // granular entry/target/stop levels persist visually across all higher timeframes.
          if (selection && rangeParams) {
            try {
              const [setupRes, zonesRes] = await Promise.allSettled([
                fetch(`/api/setup?pair=${pair}&interval=15min${rangeParams}`, {
                  signal: abortController.signal,
                }),
                fetch(`/api/confluence?pair=${pair}&interval=15min${rangeParams}`, {
                  signal: abortController.signal,
                }),
              ]);
              if (
                setupRes.status === 'fulfilled' &&
                setupRes.value.ok &&
                setupPrimitiveRef.current
              ) {
                const setupData = await setupRes.value.json();
                setupPrimitiveRef.current.setSetup(setupData);
              }
              if (
                zonesRes.status === 'fulfilled' &&
                zonesRes.value.ok &&
                zonesPrimitiveRef.current
              ) {
                const confluenceData = await zonesRes.value.json();
                const top3 = normalizeZoneSignals((confluenceData.zones || []).slice(0, 3));
                zonesPrimitiveRef.current.setZones(top3);
              }
            } catch (err) {
              if (err?.name !== 'AbortError') {
                // Setup/zones are non-critical — silently ignore errors
              }
            }
          } else {
            setupPrimitiveRef.current?.clear();
            zonesPrimitiveRef.current?.clear();
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        setError(CHART.error);
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
      const gannBoxes =
        intervalRef.current === '4h' && htfBosDataRef.current.length > 0
          ? deriveGannFromBos(htfBosDataRef.current, htfBiasRef.current)
          : filterByBias(gannDataRef.current, htfBiasRef.current);
      gannPrimitiveRef.current.setBoxes(showGann ? gannBoxes : []);
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

  useEffect(() => {
    if (wyckoffPrimitiveRef.current) {
      wyckoffPrimitiveRef.current.setSignals(
        showWyckoff ? filterByBias(wyckoffDataRef.current, htfBiasRef.current) : [],
      );
    }
  }, [showWyckoff]);

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

  const handleMouseDown = useCallback(
    (e) => {
      if (!isSelecting || !chartRef.current || !seriesRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      isDraggingRef.current = true;
      dragStartRef.current = { x, y };
    },
    [isSelecting],
  );

  const handleMouseMove = useCallback(
    (e) => {
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
    },
    [clampTime, clampPrice],
  );

  const handleMouseUp = useCallback(
    (e) => {
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
    },
    [onSelectionChange, clampTime, clampPrice],
  );

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

  // Sync selection end time to Gann/Liq primitives only — FVG/OB zones extend
  // to the right edge naturally based on their own mitigation timestamps.
  useEffect(() => {
    const endChartTime = selection?.end ? toChartTime(selection.end) : null;
    if (liqPrimitiveRef.current) liqPrimitiveRef.current.setEndTime(endChartTime);
    if (gannPrimitiveRef.current) gannPrimitiveRef.current.setEndTime(endChartTime);
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
        data-tour="chart"
      />
      <div className="chart-toolbar">
        <button
          className={`chart-toolbar__btn ${isSelecting ? 'chart-toolbar__btn--active' : ''}`}
          onClick={() => setIsSelecting(!isSelecting)}
          title={CHART.selectTitle}
          data-tour="select-tool"
        >
          {CHART.selectLabel}
        </button>
        {selection && (
          <>
            <button
              className="chart-toolbar__btn chart-toolbar__btn--clear"
              onClick={handleClearSelection}
              title={CHART.clearTitle}
            >
              {CHART.clearLabel}
            </button>
            <span className="chart-toolbar__label">{CHART.selectionActive}</span>
          </>
        )}
        {toolbarExtras && <div className="chart-toolbar__extras">{toolbarExtras}</div>}
      </div>
    </div>
  );
}

export default CandlestickChart;
