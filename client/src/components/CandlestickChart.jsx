import { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { BOSLinesPrimitive } from './BOSLinesPrimitive';
import { FVGBoxesPrimitive } from './FVGBoxesPrimitive';
import { SelectionBoxPrimitive } from './SelectionBoxPrimitive';

function filterBOS(signals, region) {
  if (!region) return signals;
  return signals.filter(
    (s) =>
      s.swing_timestamp >= region.startTime &&
      s.timestamp <= region.endTime &&
      s.swing_ref >= region.bottomPrice &&
      s.swing_ref <= region.topPrice,
  );
}

function filterFVG(signals, region) {
  if (!region) return signals;
  return signals.filter(
    (s) =>
      s.timestamp >= region.startTime &&
      s.timestamp <= region.endTime &&
      s.top >= region.bottomPrice &&
      s.bottom <= region.topPrice,
  );
}

function CandlestickChart({ pair, interval, showBOS, showFVG, region, onRegionChange }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bosPrimitiveRef = useRef(null);
  const fvgPrimitiveRef = useRef(null);
  const selectionPrimitiveRef = useRef(null);
  const bosDataRef = useRef([]);
  const fvgDataRef = useRef([]);
  const drawingRef = useRef(null);

  // Apply filtered data to primitives
  const applyOverlays = useCallback(
    (currentRegion) => {
      const bosAll = bosDataRef.current || [];
      const fvgAll = fvgDataRef.current || [];

      if (bosPrimitiveRef.current) {
        bosPrimitiveRef.current.setLines(showBOS ? filterBOS(bosAll, currentRegion) : []);
      }
      if (fvgPrimitiveRef.current) {
        fvgPrimitiveRef.current.setZones(showFVG ? filterFVG(fvgAll, currentRegion) : []);
      }
    },
    [showBOS, showFVG],
  );

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

    // Attach primitives
    const bosPrimitive = new BOSLinesPrimitive();
    series.attachPrimitive(bosPrimitive);
    bosPrimitiveRef.current = bosPrimitive;

    const fvgPrimitive = new FVGBoxesPrimitive();
    series.attachPrimitive(fvgPrimitive);
    fvgPrimitiveRef.current = fvgPrimitive;

    const selectionPrimitive = new SelectionBoxPrimitive();
    series.attachPrimitive(selectionPrimitive);
    selectionPrimitiveRef.current = selectionPrimitive;

    // Handle window resize
    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    // Shift+drag drawing handlers
    const container = chartContainerRef.current;

    const handleMouseDown = (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      drawingRef.current = {
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
      };
      chart.applyOptions({ handleScroll: false, handleScale: false });
    };

    const handleMouseMove = (e) => {
      if (!drawingRef.current) return;
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const { startX, startY } = drawingRef.current;

      selectionPrimitiveRef.current.setPixelBox({
        x: Math.min(startX, curX),
        y: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      });
    };

    const handleMouseUp = (e) => {
      if (!drawingRef.current) return;
      const rect = container.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const { startX, startY } = drawingRef.current;
      drawingRef.current = null;

      chart.applyOptions({ handleScroll: true, handleScale: true });

      // Convert pixel coords to data coords
      const timeScale = chart.timeScale();
      const t1 = timeScale.coordinateToTime(startX);
      const t2 = timeScale.coordinateToTime(endX);
      const p1 = series.coordinateToPrice(startY);
      const p2 = series.coordinateToPrice(endY);

      if (t1 === null || t2 === null || p1 === null || p2 === null) {
        selectionPrimitiveRef.current.clear();
        return;
      }

      const newRegion = {
        startTime: t1 < t2 ? t1 : t2,
        endTime: t1 < t2 ? t2 : t1,
        topPrice: Math.max(p1, p2),
        bottomPrice: Math.min(p1, p2),
      };

      selectionPrimitiveRef.current.setRegion(newRegion);

      if (onRegionChange) {
        onRegionChange(newRegion);
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
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

          applyOverlays(region);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    }

    // Clear region when pair/interval changes
    if (selectionPrimitiveRef.current) {
      selectionPrimitiveRef.current.clear();
    }
    if (onRegionChange) {
      onRegionChange(null);
    }

    fetchData();
  }, [pair, interval]);

  // Re-filter when toggles or region change
  useEffect(() => {
    applyOverlays(region);
  }, [showBOS, showFVG, region, applyOverlays]);

  // Sync selection box primitive with region prop (for external clear)
  useEffect(() => {
    if (!region && selectionPrimitiveRef.current) {
      selectionPrimitiveRef.current.clear();
    }
  }, [region]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}

export default CandlestickChart;
