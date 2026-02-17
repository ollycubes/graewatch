import { useState } from 'react';
import CandlestickChart from './components/CandlestickChart';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
const INTERVALS = ['daily', '1h', '4h', 'weekly'];

function App() {
  const [pair, setPair] = useState('EUR/USD');
  const [interval, setInterval] = useState('daily');

  return (
    <main className="dashboard">
      <section className="dashboard__panel">
        <header className="dashboard__header">
          <h1>Graewatch</h1>
          <p>Live market structure overview</p>
        </header>

        <div className="dashboard__controls" aria-label="Chart controls">
          <label className="control">
            <span>Pair</span>
            <select value={pair} onChange={(e) => setPair(e.target.value)}>
              {PAIRS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="control">
            <span>Interval</span>
            <select value={interval} onChange={(e) => setInterval(e.target.value)}>
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dashboard__chart-frame">
          <CandlestickChart pair={pair} interval={interval} />
        </div>
      </section>
    </main>
  );
}

export default App;
