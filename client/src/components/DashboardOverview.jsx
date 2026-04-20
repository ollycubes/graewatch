// Root layout component for the dashboard.
// Uses the checklist sidebar instead of overlay toggles.
// The chart and sidebar render based on the current checklist step.
import { useCallback, useRef } from 'react';
import CandlestickChart from './CandlestickChart';
import PairSelector from './PairSelector';
import ChecklistSidebar from './ChecklistSidebar';
import SetupCard from './SetupCard';
import OverlayToggles from './OverlayToggles';
import SnapshotHistory from './SnapshotHistory';
import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';

function DashboardOverview() {
  const { state, dispatch, intervals } = useDashboard();
  const screenshotRef = useRef(null);
  const currentStepDef = CHECKLIST_STEPS[state.checklist.currentStep];

  // Handle selection box changes from the chart
  const handleSelectionChange = useCallback(
    (sel) => {
      if (sel) {
        dispatch({ type: 'SET_SELECTION', payload: sel });
      } else {
        dispatch({ type: 'CLEAR_SELECTION' });
      }
    },
    [dispatch],
  );

  return (
    <section className="dashboard__panel">
      <header className="dashboard__top-bar">
        <div className="dashboard__branding">
          <h1>Graewatch</h1>
          <p>Top-down SMC analysis</p>
        </div>
        
        <div className="dashboard__step-indicator">
          <span className="step-label">Step {state.checklist.currentStep}</span>
          <span className="step-title">{currentStepDef?.title}</span>
        </div>
      </header>

      <div className="dashboard__controls" aria-label="Chart controls">
        <div className="dashboard__controls-primary">
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
                <span className="icon">📊</span> Viewing: {currentStepDef.interval.toUpperCase()}
              </span>
            )}
          </div>
        </div>

      </div>

      <div className="dashboard__prediction-bar">
        <SetupCard
          pair={state.pair}
          interval={state.interval}
          selection={state.selection}
          onClearSelection={() => dispatch({ type: 'CLEAR_SELECTION' })}
          screenshotRef={screenshotRef}
        />
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
              showWyckoff={state.overlays.wyckoff}
              selection={state.selection}
              onSelectionChange={handleSelectionChange}
              toolbarExtras={<OverlayToggles />}
              onScreenshotRef={screenshotRef}
            />
          </div>
        </div>
      </div>

      <SnapshotHistory pair={state.pair} />

    </section>
  );
}

export default DashboardOverview;
