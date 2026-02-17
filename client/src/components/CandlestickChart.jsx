import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';

function CandlestickChart({ pair, interval }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bosMarkersRef = useRef(null);

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
    async function fetchCandles() {
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

          // Fetch BOS signals and render as markers
          try {
            const bosRes = await fetch(`/api/analysis/bos?pair=${pair}&interval=${interval}`);
            const bosData = await bosRes.json();

            if (bosData.signals) {
              const markers = bosData.signals.map((s) => ({
                time: s.timestamp,
                position: s.direction === 'bullish' ? 'belowBar' : 'aboveBar',
                color: s.direction === 'bullish' ? '#26a69a' : '#ef5350',
                shape: s.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
                text: 'BOS',
              }));

              markers.sort((a, b) => (a.time < b.time ? -1 : 1));
              if (bosMarkersRef.current) {
                bosMarkersRef.current.setMarkers(markers);
              } else {
                bosMarkersRef.current = createSeriesMarkers(seriesRef.current, markers);
              }
            }
          } catch (err) {
            console.error('Failed to fetch BOS signals:', err);
          }
        }
      } catch (error) {
        console.error('Failed to fetch candles:', error);
      }
    }

    fetchCandles();
  }, [pair, interval]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}

export default CandlestickChart;
