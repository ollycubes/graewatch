import { useCallback, useRef, useState } from 'react';
import CandlestickChart from './CandlestickChart';
import PairSelector from './PairSelector';
import ChecklistSidebar from './ChecklistSidebar';
import SetupCard from './SetupCard';
import OverlayToggles from './OverlayToggles';
import SnapshotHistory from './SnapshotHistory';
import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';
import content from '../content.json';

const { app, nav, controls } = content;

function DashboardOverview() {
  const { state, dispatch, intervals } = useDashboard();
  const screenshotRef = useRef(null);
  const currentStepDef = CHECKLIST_STEPS[state.checklist.currentStep];
  const [page, setPage] = useState('analysis');

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
          <h1>{app.title}</h1>
          <p>{app.tagline}</p>
        </div>

        <nav className="dashboard__nav">
          <button
            className={`dashboard__nav-tab${page === 'analysis' ? ' dashboard__nav-tab--active' : ''}`}
            onClick={() => setPage('analysis')}
          >
            {nav.analysis}
          </button>
          <button
            className={`dashboard__nav-tab${page === 'journal' ? ' dashboard__nav-tab--active' : ''}`}
            onClick={() => setPage('journal')}
          >
            {nav.journal}
          </button>
        </nav>

      </header>

      {page === 'analysis' && (
        <>
          <div className="dashboard__controls" aria-label="Chart controls">
            <div className="dashboard__controls-primary">
              <PairSelector />

              <label className="control">
                <span>{controls.interval}</span>
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
                    <span className="icon">📊</span> {controls.viewing} {currentStepDef.interval.toUpperCase()}
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
        </>
      )}

      {page === 'journal' && (
        <div className="dashboard__journal-page">
          <SnapshotHistory pair={state.pair} />
        </div>
      )}
    </section>
  );
}

export default DashboardOverview;
