import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { BOSLinesPrimitive } from './BOSLinesPrimitive';
import { FVGBoxesPrimitive } from './FVGBoxesPrimitive';

function CandlestickChart({ pair, interval, showBOS, showFVG }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bosPrimitiveRef = useRef(null);
  const fvgPrimitiveRef = useRef(null);
  const bosDataRef = useRef(null);
  const fvgDataRef = useRef(null);

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

    // Attach BOS lines primitive
    const bosPrimitive = new BOSLinesPrimitive();
    series.attachPrimitive(bosPrimitive);
    bosPrimitiveRef.current = bosPrimitive;

    // Attach FVG boxes primitive
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
    async function fetchData() {
      try {
        const response = await fetch(`/api/candles?pair=${pair}&interval=${interval}`);
        const data = await response.json();

        if (data.candles && seriesRef.current) {
          const formatted = data.candles.map((c) => ({
            time: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          seriesRef.current.setData(formatted);
          chartRef.current.timeScale().fitContent();

          // Fetch BOS and FVG signals in parallel
          const [bosRes, fvgRes] = await Promise.all([
            fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}`),
            fetch(`/api/analysis/fvg?pair=${pair}&interval=${interval}`),
          ]);

          const bosData = await bosRes.json();
          const fvgData = await fvgRes.json();

          bosDataRef.current = bosData.signals || [];
          fvgDataRef.current = fvgData.signals || [];

          // Apply based on current toggle state
          if (bosPrimitiveRef.current) {
            bosPrimitiveRef.current.setLines(showBOS ? bosDataRef.current : []);
          }
          if (fvgPrimitiveRef.current) {
            fvgPrimitiveRef.current.setZones(showFVG ? fvgDataRef.current : []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    }

    fetchData();
  }, [pair, interval]);

  // Toggle overlays without re-fetching
  useEffect(() => {
    if (bosPrimitiveRef.current) {
      bosPrimitiveRef.current.setLines(showBOS ? bosDataRef.current || [] : []);
    }
  }, [showBOS]);

  useEffect(() => {
    if (fvgPrimitiveRef.current) {
      fvgPrimitiveRef.current.setZones(showFVG ? fvgDataRef.current || [] : []);
    }
  }, [showFVG]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}

export default CandlestickChart;
