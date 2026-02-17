import { createContext, useContext, useMemo, useReducer } from 'react';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'];
const INTERVALS = [
  { label: '1W', value: 'weekly' },
  { label: '1D', value: 'daily' },
  { label: '4H', value: '4h' },
  { label: '1H', value: '1h' },
  { label: '15min', value: '15min' },
];

const initialState = {
  pair: 'EUR/USD',
  interval: 'daily',
  overlays: {
    bos: true,
    fvg: true,
  },
};

function dashboardReducer(state, action) {
  switch (action.type) {
    case 'SET_PAIR':
      return { ...state, pair: action.payload };
    case 'SET_INTERVAL':
      return { ...state, interval: action.payload };
    case 'TOGGLE_OVERLAY':
      return {
        ...state,
        overlays: {
          ...state.overlays,
          [action.payload]: !state.overlays[action.payload],
        },
      };
    default:
      return state;
  }
}

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  const value = useMemo(() => ({
    state,
    dispatch,
    pairs: PAIRS,
    intervals: INTERVALS,
  }), [state]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used inside DashboardProvider');
  }
  return context;
}
