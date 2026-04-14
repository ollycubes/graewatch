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
    title: '1W · Weekly',
    subtitle: 'Momentum & magnets',
    interval: 'weekly',
    overlays: { bos: false, fvg: true, gann: false, orderblocks: true, liquidity: false },
    items: [
      { key: 'w_momentum', label: 'Read the last 2 weekly candles to gauge where momentum is moving', required: true },
      { key: 'w_fvg', label: 'Mark any unfilled FVGs that could act as a magnet for price', required: true },
      { key: 'w_ob', label: 'Note whether price is moving into, or reacting off, significant order blocks', required: true },
    ],
    requiredCount: 3,
  },
  {
    id: 1,
    title: '1D · Daily',
    subtitle: 'BOS & order blocks',
    interval: 'daily',
    overlays: { bos: true, fvg: false, gann: false, orderblocks: true, liquidity: true },
    items: [
      { key: 'd_bos', label: 'Mark the last 3+ breaks of structure, most recent first, labelling both the swing that caused each BOS and the swing that was broken', required: true },
      { key: 'd_ob', label: 'Mark daily order blocks, giving particular weight to bearish OBs sitting above liquidity and bullish OBs below liquidity', required: true },
    ],
    requiredCount: 2,
  },
  {
    id: 2,
    title: '4H · 4-Hour',
    subtitle: 'Confluence & Gann',
    interval: '4h',
    overlays: { bos: true, fvg: true, gann: true, orderblocks: true, liquidity: true },
    items: [
      { key: 'h4_orderflow', label: 'Check that 4H orderflow aligns with the daily bias — or that a 4H CHoCH is about to bring it into alignment', required: true },
      { key: 'h4_gann', label: 'Anchor the Gannbox from the swing that caused the most recent daily BOS to the swing that was broken', required: true },
      { key: 'h4_poi_gann', label: 'A valid POI sits inside the Gannbox in a premium or discount zone where price can react off an FVG or OB', required: true },
      { key: 'h4_liq', label: 'Confluence is stronger when liquidity sits around or beyond the POI, acting as fuel for the reaction', required: false },
    ],
    requiredCount: 3,
  },
  {
    id: 3,
    title: '1H · 1-Hour',
    subtitle: 'POI entry confirmation',
    interval: '1h',
    overlays: { bos: true, fvg: true, gann: true, orderblocks: true, liquidity: true },
    items: [
      { key: 'h1_entered', label: 'Confirm price has entered the POI zone', required: true },
      { key: 'h1_volume', label: 'Look for increasing volume into the zone — bars stepping up like a rising pyramid on the chart', required: true },
      { key: 'h1_reject', label: 'Reject the entry if price closes well beyond the zone', required: false },
      { key: 'h1_hover', label: 'Keep the setup live while price is hovering within the zone', required: false },
    ],
    requiredCount: 2,
  },
  {
    id: 4,
    title: '15M · 15-Minute',
    subtitle: 'Entry trigger',
    interval: '15min',
    overlays: { bos: true, fvg: true, gann: false, orderblocks: true, liquidity: true },
    items: [
      { key: 'm15_wyckoff', label: 'Look for Wyckoff structures forming inside the zone — not essential, but a strong bonus when present', required: false },
      { key: 'm15_sweep', label: 'Look for a liquidity sweep of local 15-minute highs or lows inside the zone', required: true },
    ],
    requiredCount: 1,
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
  // Selection box state — null means no selection, otherwise { start, end } timestamps
  selection: null,
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
        selection: null,
        checklist: {
          currentStep: 0,
          completedSteps: [],
          checked: buildInitialChecked(),
        },
      };

    case 'SET_SELECTION':
      // payload: { start: string, end: string }
      return { ...state, selection: action.payload };

    case 'CLEAR_SELECTION':
      return { ...state, selection: null };

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
