import { createContext, useContext } from 'react';

export const PAIRS = ['EUR/USD', 'GBP/USD'];
export const INTERVALS = [
  { label: '1W', value: 'weekly' },
  { label: '1D', value: 'daily' },
  { label: '4H', value: '4h' },
  { label: '1H', value: '1h' },
  { label: '15min', value: '15min' },
];

export const HTF_MAP = {
  '15min': '1h',
  '1h': '4h',
  '4h': 'daily',
  'daily': 'weekly',
  'weekly': null,
};

// ── Step definitions matching the SMC checklist ──────────────────────────
// Each step specifies:
//   - title & subtitle for the sidebar
//   - the chart interval to show
//   - which overlays to enable
//   - sub-items (the individual checklist checkboxes)
//   - requiredCount: how many sub-items must be checked to complete the step

export const CHECKLIST_STEPS = [
  {
    id: 0,
    title: 'Pre-Flight',
    subtitle: 'Session & risk gate',
    interval: null, // no chart change — user picks the pair here
    overlays: { bos: false, fvg: false, gann: false, orderblocks: false, liquidity: false },
    items: [
      { key: 'killzone', label: 'In London killzone 07:00–10:00 GMT or NY 12:30–15:30 GMT', required: true },
      { key: 'news', label: 'No red-folder news within ±30 min on this pair', required: true },
      { key: 'onepair', label: 'One pair, one thesis — no correlated stacking', required: true },
    ],
    requiredCount: 3,
  },
  {
    id: 1,
    title: '1W · Bias',
    subtitle: 'Weekly structure direction',
    interval: 'weekly',
    overlays: { bos: true, fvg: true, gann: true, orderblocks: false, liquidity: false },
    items: [
      { key: 'w_bos_dir', label: 'Bias = direction of last confirmed weekly BOS (not last 2–3 candles)', required: true },
      { key: 'w_momentum', label: 'Last 2–3 candles read as momentum only: impulse or correction?', required: true },
      { key: 'w_fvg', label: 'Unfilled weekly FVG with bias = magnet; opposing FVG = hazard', required: false },
      { key: 'w_standdown', label: 'STAND DOWN if mid-range between recent BOS and opposing liquidity', required: false },
    ],
    requiredCount: 2,
  },
  {
    id: 2,
    title: '1D · Map the POIs',
    subtitle: 'Daily points of interest',
    interval: 'daily',
    overlays: { bos: true, fvg: true, gann: false, orderblocks: true, liquidity: true },
    items: [
      { key: 'd_bos', label: 'Last 3 daily BOS marked (most recent first) with causing + broken swings', required: true },
      { key: 'd_ob_qualify', label: 'Daily OB qualifies: ≥1.5× ATR displacement, liquidity position, weekly bias aligned', required: true },
      { key: 'd_invalidation', label: 'Written invalidation level for each POI', required: true },
      { key: 'd_max_pois', label: 'Max 3 active daily POIs on this pair', required: false },
    ],
    requiredCount: 3,
  },
  {
    id: 3,
    title: '4H · Confluence & Orderflow',
    subtitle: '4H confirmation gate',
    interval: '4h',
    overlays: { bos: true, fvg: true, gann: true, orderblocks: true, liquidity: true },
    items: [
      { key: 'h4_gate', label: 'GATE: 4H orderflow aligns with daily bias (or 4H CHoCH confirmed)', required: true },
      { key: 'h4_gann', label: 'Gannbox anchored: swing that CAUSED last daily BOS → swing that was BROKEN', required: true },
      { key: 'h4_eqhl', label: 'Equal highs/lows within 1.5× ATR of POI marked', required: false },
      { key: 'h4_gann50', label: 'POI inside Gann 50% or key level (25/50/75%)', required: false },
      { key: 'h4_fvg', label: 'Overlapping 4H FVG', required: false },
      { key: 'h4_liq_pool', label: 'Liquidity pool just beyond POI (fuel)', required: false },
      { key: 'h4_bos_align', label: 'Aligned with 4H BOS direction', required: false },
    ],
    requiredCount: 2, // need ≥ 2 confluence
  },
  {
    id: 4,
    title: '1H · Arm the Trade',
    subtitle: 'POI entry confirmation',
    interval: '1h',
    overlays: { bos: true, fvg: true, gann: true, orderblocks: true, liquidity: true },
    items: [
      { key: 'h1_entered', label: 'Price has ENTERED POI (wick or body — pick one rule, stay consistent)', required: true },
      { key: 'h1_volume', label: 'Tap-candle tick volume > 20-period tick-volume SMA', required: false },
      { key: 'h1_rejection', label: 'Rejection within 2h: wick ≥50% of candle range OR close back outside OB', required: true },
      { key: 'h1_norejection', label: 'No rejection in 2h → observation only, do not execute', required: false },
    ],
    requiredCount: 2,
  },
  {
    id: 5,
    title: '15M · Entry Trigger',
    subtitle: 'All 3 required for execution',
    interval: '15min',
    overlays: { bos: true, fvg: true, gann: false, orderblocks: true, liquidity: true },
    items: [
      { key: 'm15_sweep', label: 'Liquidity sweep of local 15m high (short) / low (long) INSIDE the POI', required: true },
      { key: 'm15_choch', label: 'CHoCH on 15m in HTF bias direction (break of most recent internal structure)', required: true },
      { key: 'm15_retest', label: 'Retest of CHoCH level, ideally into 15m OB or FVG from displacement', required: true },
      { key: 'm15_entry', label: 'Entry on retest · Stop beyond sweep wick + spread buffer', required: true },
    ],
    requiredCount: 4, // ALL 3+1 required
  },
  {
    id: 6,
    title: 'Trade Management',
    subtitle: 'Risk & targets',
    interval: null, // keep current TF
    overlays: { bos: true, fvg: true, gann: true, orderblocks: true, liquidity: true },
    items: [
      { key: 'tm_risk', label: 'Risk 0.5–1% per trade · Funded: personal hard stop at 60% of daily DD limit', required: true },
      { key: 'tm_tp1', label: 'TP1: 1R OR nearest opposing 4H liquidity, whichever first — take 50%', required: true },
      { key: 'tm_be', label: 'Move stop to break-even on TP1 fill', required: false },
      { key: 'tm_tp2', label: 'TP2: next HTF POI / liquidity pool · trail on 1H structure', required: false },
      { key: 'tm_kill', label: 'KILL: close on 1H CHoCH against position before TP1 — don\'t wait for stop', required: false },
      { key: 'tm_fvg_opp', label: 'Approaching opposing weekly FVG: take another 25% off', required: false },
    ],
    requiredCount: 2,
  },
];

// Build the initial checked-items map: { 'killzone': false, 'news': false, ... }
function buildInitialChecked() {
  const checked = {};
  for (const step of CHECKLIST_STEPS) {
    for (const item of step.items) {
      checked[item.key] = false;
    }
  }
  return checked;
}

export const initialState = {
  pair: 'EUR/USD',
  interval: 'daily',
  overlays: {
    bos: false,
    fvg: false,
    gann: false,
    orderblocks: false,
    liquidity: false,
  },
  // Checklist state
  checklist: {
    currentStep: 0,
    completedSteps: [], // array of completed step ids
    checked: buildInitialChecked(),
  },
};

// Derive which overlays should be visible based on all completed & active steps
function deriveOverlays(currentStep, completedSteps) {
  const merged = { bos: false, fvg: false, gann: false, orderblocks: false, liquidity: false };
  // Enable overlays from all completed steps AND the current active step
  const relevantSteps = [...completedSteps, currentStep];
  for (const stepId of relevantSteps) {
    const stepDef = CHECKLIST_STEPS[stepId];
    if (!stepDef) continue;
    for (const [key, val] of Object.entries(stepDef.overlays)) {
      if (val) merged[key] = true;
    }
  }
  return merged;
}

// Derive the chart interval from the current step
function deriveInterval(currentStep, currentInterval) {
  const stepDef = CHECKLIST_STEPS[currentStep];
  if (!stepDef) return currentInterval;
  // If step has an interval, switch to it. Otherwise keep current.
  return stepDef.interval || currentInterval;
}

// Check whether a step's required sub-items are all checked
function isStepComplete(stepId, checked) {
  const stepDef = CHECKLIST_STEPS[stepId];
  if (!stepDef) return false;
  const requiredItems = stepDef.items.filter((item) => item.required);
  const checkedCount = stepDef.items.filter((item) => checked[item.key]).length;
  // Must check all required items AND meet the requiredCount minimum
  const allRequiredChecked = requiredItems.every((item) => checked[item.key]);
  return allRequiredChecked && checkedCount >= stepDef.requiredCount;
}

export function dashboardReducer(state, action) {
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

    case 'TOGGLE_CHECKLIST_ITEM': {
      const key = action.payload;
      const newChecked = { ...state.checklist.checked, [key]: !state.checklist.checked[key] };
      const currentStep = state.checklist.currentStep;

      // Derive new overlays and interval
      const newOverlays = deriveOverlays(currentStep, state.checklist.completedSteps);
      const newInterval = deriveInterval(currentStep, state.interval);

      return {
        ...state,
        interval: newInterval,
        overlays: newOverlays,
        checklist: {
          ...state.checklist,
          checked: newChecked,
        },
      };
    }

    case 'ADVANCE_STEP': {
      const current = state.checklist.currentStep;
      if (!isStepComplete(current, state.checklist.checked)) {
        return state; // can't advance if current step not complete
      }
      const nextStep = Math.min(current + 1, CHECKLIST_STEPS.length - 1);
      const newCompleted = state.checklist.completedSteps.includes(current)
        ? state.checklist.completedSteps
        : [...state.checklist.completedSteps, current];

      const newOverlays = deriveOverlays(nextStep, newCompleted);
      const newInterval = deriveInterval(nextStep, state.interval);

      return {
        ...state,
        interval: newInterval,
        overlays: newOverlays,
        checklist: {
          ...state.checklist,
          currentStep: nextStep,
          completedSteps: newCompleted,
        },
      };
    }

    case 'GO_TO_STEP': {
      const targetStep = action.payload;
      // Can only go to completed steps or the next available step
      const isAllowed =
        state.checklist.completedSteps.includes(targetStep) ||
        targetStep === state.checklist.currentStep;
      if (!isAllowed) return state;

      const newOverlays = deriveOverlays(targetStep, state.checklist.completedSteps);
      const newInterval = deriveInterval(targetStep, state.interval);

      return {
        ...state,
        interval: newInterval,
        overlays: newOverlays,
        checklist: {
          ...state.checklist,
          currentStep: targetStep,
        },
      };
    }

    case 'RESET_CHECKLIST':
      return {
        ...state,
        interval: 'daily',
        overlays: initialState.overlays,
        checklist: {
          currentStep: 0,
          completedSteps: [],
          checked: buildInitialChecked(),
        },
      };

    default:
      return state;
  }
}

export { isStepComplete };

export const DashboardContext = createContext(null);

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used inside DashboardProvider');
  }
  return context;
}
