import { useMemo, useReducer } from 'react';
import {
  CHECKLIST_STEPS,
  DashboardContext,
  INTERVALS,
  PAIRS,
  dashboardReducer,
  initialState,
  isStepComplete,
} from './dashboardStore';

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

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
