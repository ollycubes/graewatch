// Root layout component for the dashboard.
// Uses the checklist sidebar instead of overlay toggles.
// The chart and sidebar render based on the current checklist step.
import CandlestickChart from './CandlestickChart';
import PairSelector from './PairSelector';
import ChecklistSidebar from './ChecklistSidebar';
import SummaryPanel from './SummaryPanel';
import PredictionCard from './PredictionCard';
import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';

function DashboardOverview() {
  const { state, dispatch, intervals } = useDashboard();
  const currentStepDef = CHECKLIST_STEPS[state.checklist.currentStep];

  // Show prediction card only at the final step (15M entry trigger)
  const showPrediction = state.checklist.currentStep >= 4;

  return (
    <section className="dashboard__panel">
      <header className="dashboard__header">
        <h1>Graewatch</h1>
        <p>
          Top-down SMC analysis ·{' '}
          <span className="dashboard__step-badge">
            Step {state.checklist.currentStep}: {currentStepDef?.title}
          </span>
        </p>
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

        <div className="dashboard__interval-hint">
          {currentStepDef?.interval && (
            <span className="interval-hint">
              📊 Viewing: {currentStepDef.interval.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="dashboard__content">
        <ChecklistSidebar />

        <div className="dashboard__main">
          <div className="dashboard__chart-frame">
            <CandlestickChart
              pair={state.pair}
              interval={state.interval}
              showBOS={state.overlays.bos}
              showFVG={state.overlays.fvg}
              showGann={state.overlays.gann}
              showOB={state.overlays.orderblocks}
              showLiq={state.overlays.liquidity}
            />
          </div>

          {showPrediction && (
            <div className="dashboard__sidebar">
              <PredictionCard pair={state.pair} interval={state.interval} />
            </div>
          )}
        </div>
      </div>

      <SummaryPanel pair={state.pair} interval={state.interval} />
    </section>
  );
}

export default DashboardOverview;
