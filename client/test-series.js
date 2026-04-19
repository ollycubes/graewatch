import { createChart } from 'lightweight-charts';
const chart = createChart(document.createElement('div'));
const series = chart.addCandlestickSeries();
console.log(typeof series.data);
