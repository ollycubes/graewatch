import { useMemo, useReducer } from 'react';
import {
  DashboardContext,
  INTERVALS,
  PAIRS,
  dashboardReducer,
  initialState,
} from './dashboardStore';

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      pairs: PAIRS,
      intervals: INTERVALS,
    }),
    [state],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
