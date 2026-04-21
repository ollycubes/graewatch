// ChecklistSidebar — top-down SMC checklist stepper.
// Walks through each step of the strategy. Sub-items expand when a step is active.
// Completed steps show a green check; locked steps show a lock icon.

import { useDashboard } from '../context/useDashboard';
import { CHECKLIST_STEPS } from '../context/dashboardStore';
import content from '../content.json';

const { checklist: CL } = content;

function StepIcon({ status }) {
  if (status === 'completed') {
    return <span className="step-icon step-icon--done">✓</span>;
  }
  if (status === 'active') {
    return <span className="step-icon step-icon--active" />;
  }
  return <span className="step-icon step-icon--locked">🔒</span>;
}

function ChecklistSidebar() {
  const { state, dispatch, isStepComplete: checkComplete } = useDashboard();
  const { currentStep, completedSteps, checked } = state.checklist;

  const hasSelection = !!state.selection;
  const canAdvance =
    hasSelection && currentStep < CHECKLIST_STEPS.length - 1 && checkComplete(currentStep);

  return (
    <aside className="checklist-sidebar" aria-label="SMC Checklist" data-tour="checklist">
      <div className="checklist-sidebar__header">
        <h2>{CL.title}</h2>
        <p className="checklist-sidebar__pair">{state.pair}</p>
        <button
          className="checklist-sidebar__reset"
          onClick={() => dispatch({ type: 'RESET_CHECKLIST' })}
          title={CL.resetTitle}
        >
          {CL.resetLabel}
        </button>
      </div>

      {/* Prompt shown when no selection exists */}
      {!hasSelection && (
        <div className="checklist-sidebar__no-selection">
          <span className="checklist-sidebar__no-selection-icon">⬚</span>
          <p>{CL.noSelectionHint}</p>
        </div>
      )}

      <div className={`checklist-sidebar__steps${!hasSelection ? ' checklist-sidebar__steps--locked' : ''}`}>
        {CHECKLIST_STEPS.map((step) => {
          const isCompleted = completedSteps.includes(step.id);
          const isActive = step.id === currentStep;
          const status = isCompleted ? 'completed' : isActive ? 'active' : 'locked';

          return (
            <div
              key={step.id}
              className={`checklist-step checklist-step--${status}`}
              onClick={() => {
                if (hasSelection && (isCompleted || isActive)) {
                  dispatch({ type: 'GO_TO_STEP', payload: step.id });
                }
              }}
            >
              <div className="checklist-step__header">
                <StepIcon status={status} />
                <div className="checklist-step__title-group">
                  <span className="checklist-step__number">{step.id}</span>
                  <span className="checklist-step__title">{step.title}</span>
                  <span className="checklist-step__subtitle">{step.subtitle}</span>
                </div>
              </div>

              {/* Expand sub-items only when active AND a selection exists */}
              {isActive && hasSelection && (
                <div className="checklist-step__items">
                  {step.items.map((item) => (
                    <label
                      key={item.key}
                      className={`checklist-item ${checked[item.key] ? 'checklist-item--checked' : ''} ${item.required ? 'checklist-item--required' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={checked[item.key]}
                        onChange={() =>
                          dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', payload: item.key })
                        }
                      />
                      <span className="checklist-item__label">
                        {item.label}
                        {item.required && <span className="checklist-item__req">*</span>}
                      </span>
                    </label>
                  ))}

                  {/* Progress indicator */}
                  <div className="checklist-step__progress">
                    <div className="checklist-step__progress-bar">
                      <div
                        className="checklist-step__progress-fill"
                        style={{
                          width: `${(step.items.filter((i) => checked[i.key]).length / step.items.length) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="checklist-step__progress-text">
                      {step.items.filter((i) => checked[i.key]).length}/{step.items.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Advance button */}
      <button
        className={`checklist-sidebar__advance ${canAdvance ? '' : 'checklist-sidebar__advance--disabled'}`}
        disabled={!canAdvance}
        onClick={() => dispatch({ type: 'ADVANCE_STEP' })}
      >
        {currentStep >= CHECKLIST_STEPS.length - 1
          ? CL.complete
          : `${CL.next} ${CHECKLIST_STEPS[currentStep + 1]?.title || ''}`}
      </button>
    </aside>
  );
}

export default ChecklistSidebar;
