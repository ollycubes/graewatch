import CandlestickChart from './CandlestickChart';
import PairSelector from './PairSelector';
import OverlayToggles from './OverlayToggles';
import SummaryPanel from './SummaryPanel';
import { useDashboard } from '../context/DashboardContext';

function DashboardOverview() {
  const { state, dispatch, intervals } = useDashboard();

  return (
    <section className="dashboard__panel">
      <header className="dashboard__header">
        <h1>Graewatch</h1>
        <p>Live market structure overview</p>
      </header>

      <div className="dashboard__controls" aria-label="Chart controls">
        <PairSelector />

        <label className="control">
          <span>Interval</span>
          <select
            value={state.interval}
            onChange={(e) => dispatch({ type: 'SET_INTERVAL', payload: e.target.value })}
          >
            {intervals.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <OverlayToggles />
      </div>

      <div className="dashboard__content">
        <div className="dashboard__chart-frame">
          <CandlestickChart
            pair={state.pair}
            interval={state.interval}
            showBOS={state.overlays.bos}
            showFVG={state.overlays.fvg}
          />
        </div>

        <SummaryPanel pair={state.pair} interval={state.interval} />
      </div>
    </section>
  );
}

export default DashboardOverview;
