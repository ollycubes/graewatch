import { useState } from 'react';
import CandlestickChart from './components/candlestickchart';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
const INTERVALS = ['daily', '1h', '4h', 'weekly'];

function App() {
  const [pair, setPair] = useState('EUR/USD');
  const [interval, setInterval] = useState('daily');

  return (
    <div
      style={{
        backgroundColor: '#131722',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1 style={{ color: '#9598a1', marginBottom: '20px' }}>Graewatch</h1>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#1e222d',
            color: '#9598a1',
            border: '1px solid #2a2e39',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {PAIRS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#1e222d',
            color: '#9598a1',
            border: '1px solid #2a2e39',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      <CandlestickChart pair={pair} interval={interval} />
    </div>
  );
}

export default App;
