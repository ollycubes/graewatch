import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

function CandlestickChart({ pair, interval }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);

    // Create the chart once on mount
    useEffect(() => {
        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 500,
            layout: {
                background: { color: '#1a1a2e' },
                textColor: '#e0e0e0',
            },
            grid: {
                vertLines: { color: '#2a2a3e' },
                horzLines: { color: '#2a2a3e' },
            },
            crosshair: {
                mode: 0,
            },
            timeScale: {
                borderColor: '#3a3a4e',
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
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
                const response = await fetch(
                    `/api/candles?pair=${pair}&interval=${interval}`
                );
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