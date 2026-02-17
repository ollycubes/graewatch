import { useState } from 'react';
import CandlestickChart from './components/CandlestickChart';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
const INTERVALS = ['daily', '1h', '4h', 'weekly'];

function App() {
  const [pair, setPair] = useState('EUR/USD');
  const [interval, setInterval] = useState('daily');
  const [showBOS, setShowBOS] = useState(true);
  const [showFVG, setShowFVG] = useState(true);
  const [region, setRegion] = useState(null);

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
          <label className="control control--toggle">
            <input
              type="checkbox"
              checked={showBOS}
              onChange={(e) => setShowBOS(e.target.checked)}
            />
            <span>BOS</span>
          </label>

          <label className="control control--toggle">
            <input
              type="checkbox"
              checked={showFVG}
              onChange={(e) => setShowFVG(e.target.checked)}
            />
            <span>FVG</span>
          </label>

          {region && (
            <button className="control control--button" onClick={() => setRegion(null)}>
              Clear Region
            </button>
          )}
        </div>

        <div className="dashboard__chart-frame">
          <CandlestickChart
            pair={pair}
            interval={interval}
            showBOS={showBOS}
            showFVG={showFVG}
            region={region}
            onRegionChange={setRegion}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
