import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { BOSLinesPrimitive } from './BOSLinesPrimitive';
import { FVGBoxesPrimitive } from './FVGBoxesPrimitive';

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

function CandlestickChart({ pair, interval, showBOS, showFVG }) {
  const [error, setError] = useState('');
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bosPrimitiveRef = useRef(null);
  const fvgPrimitiveRef = useRef(null);
  const bosDataRef = useRef([]);
  const fvgDataRef = useRef([]);
  const requestVersionRef = useRef(0);
  const showBOSRef = useRef(showBOS);
  const showFVGRef = useRef(showFVG);

  useEffect(() => {
    showBOSRef.current = showBOS;
  }, [showBOS]);

  useEffect(() => {
    showFVGRef.current = showFVG;
  }, [showFVG]);

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

    // Handle window resize
    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
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
          chartRef.current.timeScale().fitContent();

          // Fetch BOS and FVG signals in parallel without blocking candle rendering.
          const [bosResult, fvgResult] = await Promise.allSettled([
            fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}`, {
              signal: abortController.signal,
            }),
            fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}`, {
              signal: abortController.signal,
            }),
          ]);

          if (requestVersion !== requestVersionRef.current || abortController.signal.aborted) {
            return;
          }

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

          if (bosPrimitiveRef.current) {
            bosPrimitiveRef.current.setLines(showBOSRef.current ? bosDataRef.current : []);
          }
          if (fvgPrimitiveRef.current) {
            fvgPrimitiveRef.current.setZones(showFVGRef.current ? fvgDataRef.current : []);
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
  }, [pair, interval]);

  // Toggle overlays without re-fetching
  useEffect(() => {
    if (bosPrimitiveRef.current) {
      bosPrimitiveRef.current.setLines(showBOS ? bosDataRef.current : []);
    }
  }, [showBOS]);

  useEffect(() => {
    if (fvgPrimitiveRef.current) {
      fvgPrimitiveRef.current.setZones(showFVG ? fvgDataRef.current : []);
    }
  }, [showFVG]);

  return (
    <div style={{ width: '100%' }}>
      {error && <p className="chart-error">{error}</p>}
      <div
        ref={chartContainerRef}
        style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}
      />
    </div>
  );
}

export default CandlestickChart;
