import { useEffect, useMemo, useReducer } from 'react';
import {
  CHECKLIST_STEPS,
  DashboardContext,
  INTERVALS,
  PAIRS,
  dashboardReducer,
  initialState,
  isStepComplete,
} from './dashboardStore';

const STORAGE_KEY = 'graewatch_state_v1';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw);
    // Deep-merge so any new keys added to initialState are always present
    return {
      ...initialState,
      ...saved,
      overlays: { ...initialState.overlays, ...(saved.overlays ?? {}) },
      checklist: {
        ...initialState.checklist,
        ...(saved.checklist ?? {}),
        checked: { ...initialState.checklist.checked, ...(saved.checklist?.checked ?? {}) },
      },
    };
  } catch {
    return initialState;
  }
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable or quota exceeded — silent fail
  }
}

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, loadPersistedState);

  useEffect(() => {
    persistState(state);
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      pairs: PAIRS,
      intervals: INTERVALS,
      steps: CHECKLIST_STEPS,
      isStepComplete: (stepId) => isStepComplete(stepId, state.checklist.checked),
    }),
    [state],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
