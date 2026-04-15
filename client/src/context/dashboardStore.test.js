/**
 * Unit tests for the dashboardReducer and related helpers.
 *
 * The reducer is a pure function: given (state, action) → new state.
 * No DOM, no React, no network — just logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  dashboardReducer,
  initialState,
  CHECKLIST_STEPS,
  isStepComplete,
  HTF_MAP,
} from './dashboardStore.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a state where every required item in a given step is checked. */
function stateWithStepChecked(stepId, baseState = initialState) {
  const step = CHECKLIST_STEPS[stepId];
  let state = { ...baseState, checklist: { ...baseState.checklist } };
  for (const item of step.items) {
    if (item.required) {
      state = dashboardReducer(state, { type: 'TOGGLE_CHECKLIST_ITEM', payload: item.key });
    }
  }
  return state;
}

// ── initialState shape ────────────────────────────────────────────────────────

describe('initialState', () => {
  it('starts on step 0', () => {
    expect(initialState.checklist.currentStep).toBe(0);
  });

  it('has no completed steps', () => {
    expect(initialState.checklist.completedSteps).toEqual([]);
  });

  it('has no active selection', () => {
    expect(initialState.selection).toBeNull();
  });

  it('has all overlays disabled', () => {
    for (const val of Object.values(initialState.overlays)) {
      expect(val).toBe(false);
    }
  });

  it('has all checklist items unchecked', () => {
    for (const val of Object.values(initialState.checklist.checked)) {
      expect(val).toBe(false);
    }
  });
});

// ── SET_PAIR ──────────────────────────────────────────────────────────────────

describe('SET_PAIR', () => {
  it('updates the pair', () => {
    const state = dashboardReducer(initialState, { type: 'SET_PAIR', payload: 'GBP/USD' });
    expect(state.pair).toBe('GBP/USD');
  });

  it('does not mutate other state', () => {
    const state = dashboardReducer(initialState, { type: 'SET_PAIR', payload: 'GBP/USD' });
    expect(state.interval).toBe(initialState.interval);
    expect(state.checklist).toBe(initialState.checklist);
  });
});

// ── SET_INTERVAL ──────────────────────────────────────────────────────────────

describe('SET_INTERVAL', () => {
  it('updates the interval', () => {
    const state = dashboardReducer(initialState, { type: 'SET_INTERVAL', payload: '1h' });
    expect(state.interval).toBe('1h');
  });
});

// ── TOGGLE_OVERLAY ────────────────────────────────────────────────────────────

describe('TOGGLE_OVERLAY', () => {
  it('toggles a false overlay to true', () => {
    const state = dashboardReducer(initialState, { type: 'TOGGLE_OVERLAY', payload: 'bos' });
    expect(state.overlays.bos).toBe(true);
  });

  it('toggles a true overlay back to false', () => {
    const on = dashboardReducer(initialState, { type: 'TOGGLE_OVERLAY', payload: 'fvg' });
    const off = dashboardReducer(on, { type: 'TOGGLE_OVERLAY', payload: 'fvg' });
    expect(off.overlays.fvg).toBe(false);
  });

  it('does not affect other overlays', () => {
    const state = dashboardReducer(initialState, { type: 'TOGGLE_OVERLAY', payload: 'bos' });
    expect(state.overlays.fvg).toBe(false);
    expect(state.overlays.gann).toBe(false);
  });
});

// ── TOGGLE_CHECKLIST_ITEM ─────────────────────────────────────────────────────

describe('TOGGLE_CHECKLIST_ITEM', () => {
  it('marks an unchecked item as checked', () => {
    const key = CHECKLIST_STEPS[0].items[0].key;
    const state = dashboardReducer(initialState, { type: 'TOGGLE_CHECKLIST_ITEM', payload: key });
    expect(state.checklist.checked[key]).toBe(true);
  });

  it('unchecks a checked item', () => {
    const key = CHECKLIST_STEPS[0].items[0].key;
    const s1 = dashboardReducer(initialState, { type: 'TOGGLE_CHECKLIST_ITEM', payload: key });
    const s2 = dashboardReducer(s1, { type: 'TOGGLE_CHECKLIST_ITEM', payload: key });
    expect(s2.checklist.checked[key]).toBe(false);
  });

  it('does not affect other items', () => {
    const step = CHECKLIST_STEPS[0];
    const key0 = step.items[0].key;
    const key1 = step.items[1].key;
    const state = dashboardReducer(initialState, { type: 'TOGGLE_CHECKLIST_ITEM', payload: key0 });
    expect(state.checklist.checked[key1]).toBe(false);
  });

  it('does not advance the step automatically', () => {
    // Checking items should not auto-advance — only ADVANCE_STEP does that
    const state = stateWithStepChecked(0);
    expect(state.checklist.currentStep).toBe(0);
  });
});

// ── ADVANCE_STEP ──────────────────────────────────────────────────────────────

describe('ADVANCE_STEP', () => {
  it('does not advance when required items are not checked', () => {
    const state = dashboardReducer(initialState, { type: 'ADVANCE_STEP' });
    expect(state.checklist.currentStep).toBe(0);
  });

  it('advances to step 1 when step 0 is complete', () => {
    const ready = stateWithStepChecked(0);
    const state = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    expect(state.checklist.currentStep).toBe(1);
  });

  it('marks the previous step as completed', () => {
    const ready = stateWithStepChecked(0);
    const state = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    expect(state.checklist.completedSteps).toContain(0);
  });

  it('does not duplicate completed steps', () => {
    const ready = stateWithStepChecked(0);
    const s1 = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    // Going back and advancing again should not add a duplicate
    const s2 = dashboardReducer(s1, { type: 'GO_TO_STEP', payload: 0 });
    const s3 = dashboardReducer(s2, { type: 'ADVANCE_STEP' });
    const count = s3.checklist.completedSteps.filter((id) => id === 0).length;
    expect(count).toBe(1);
  });

  it('clamps at the last step', () => {
    // Advance from step 4 (last) — should stay at 4
    const atLast = {
      ...initialState,
      checklist: { ...initialState.checklist, currentStep: 4, completedSteps: [0, 1, 2, 3] },
    };
    // Mark step 4 required items as checked
    const ready = stateWithStepChecked(4, atLast);
    const state = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    expect(state.checklist.currentStep).toBe(4);
  });

  it('switches interval to the next step interval', () => {
    const ready = stateWithStepChecked(0);
    const state = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    // Step 1 is daily
    expect(state.interval).toBe(CHECKLIST_STEPS[1].interval);
  });

  it('accumulates overlays from completed and new step', () => {
    const ready = stateWithStepChecked(0);
    const state = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    // Step 0 enables fvg and orderblocks; step 1 also enables bos, orderblocks, liquidity
    // After advancing, merged overlays from steps 0 and 1 should both be reflected
    expect(state.overlays.fvg).toBe(true);   // from step 0
    expect(state.overlays.bos).toBe(true);   // from step 1
  });
});

// ── GO_TO_STEP ────────────────────────────────────────────────────────────────

describe('GO_TO_STEP', () => {
  it('allows navigating to a completed step', () => {
    const ready = stateWithStepChecked(0);
    const advanced = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    const back = dashboardReducer(advanced, { type: 'GO_TO_STEP', payload: 0 });
    expect(back.checklist.currentStep).toBe(0);
  });

  it('allows staying on the current step', () => {
    const state = dashboardReducer(initialState, { type: 'GO_TO_STEP', payload: 0 });
    expect(state.checklist.currentStep).toBe(0);
  });

  it('does not allow jumping ahead to an incomplete step', () => {
    const state = dashboardReducer(initialState, { type: 'GO_TO_STEP', payload: 3 });
    expect(state.checklist.currentStep).toBe(0); // blocked
  });

  it('updates interval to the target step interval', () => {
    const ready = stateWithStepChecked(0);
    const advanced = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    const back = dashboardReducer(advanced, { type: 'GO_TO_STEP', payload: 0 });
    expect(back.interval).toBe(CHECKLIST_STEPS[0].interval);
  });
});

// ── RESET_CHECKLIST ───────────────────────────────────────────────────────────

describe('RESET_CHECKLIST', () => {
  it('resets to step 0', () => {
    const ready = stateWithStepChecked(0);
    const advanced = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    const reset = dashboardReducer(advanced, { type: 'RESET_CHECKLIST' });
    expect(reset.checklist.currentStep).toBe(0);
  });

  it('clears completed steps', () => {
    const ready = stateWithStepChecked(0);
    const advanced = dashboardReducer(ready, { type: 'ADVANCE_STEP' });
    const reset = dashboardReducer(advanced, { type: 'RESET_CHECKLIST' });
    expect(reset.checklist.completedSteps).toEqual([]);
  });

  it('unchecks all checklist items', () => {
    const ready = stateWithStepChecked(0);
    const reset = dashboardReducer(ready, { type: 'RESET_CHECKLIST' });
    for (const val of Object.values(reset.checklist.checked)) {
      expect(val).toBe(false);
    }
  });

  it('clears the selection', () => {
    const withSel = dashboardReducer(initialState, {
      type: 'SET_SELECTION',
      payload: { start: 100, end: 200 },
    });
    const reset = dashboardReducer(withSel, { type: 'RESET_CHECKLIST' });
    expect(reset.selection).toBeNull();
  });

  it('resets interval to daily', () => {
    const s = dashboardReducer(initialState, { type: 'SET_INTERVAL', payload: '4h' });
    const reset = dashboardReducer(s, { type: 'RESET_CHECKLIST' });
    expect(reset.interval).toBe('daily');
  });
});

// ── SET_SELECTION / CLEAR_SELECTION ──────────────────────────────────────────

describe('SET_SELECTION', () => {
  it('stores the selection', () => {
    const payload = { start: 1700000000, end: 1700003600 };
    const state = dashboardReducer(initialState, { type: 'SET_SELECTION', payload });
    expect(state.selection).toEqual(payload);
  });

  it('replaces a prior selection', () => {
    const s1 = dashboardReducer(initialState, {
      type: 'SET_SELECTION',
      payload: { start: 100, end: 200 },
    });
    const s2 = dashboardReducer(s1, {
      type: 'SET_SELECTION',
      payload: { start: 300, end: 400 },
    });
    expect(s2.selection).toEqual({ start: 300, end: 400 });
  });
});

describe('CLEAR_SELECTION', () => {
  it('sets selection back to null', () => {
    const withSel = dashboardReducer(initialState, {
      type: 'SET_SELECTION',
      payload: { start: 100, end: 200 },
    });
    const cleared = dashboardReducer(withSel, { type: 'CLEAR_SELECTION' });
    expect(cleared.selection).toBeNull();
  });

  it('is a no-op when selection is already null', () => {
    const state = dashboardReducer(initialState, { type: 'CLEAR_SELECTION' });
    expect(state.selection).toBeNull();
  });
});

// ── unknown action ────────────────────────────────────────────────────────────

describe('unknown action', () => {
  it('returns state unchanged', () => {
    const state = dashboardReducer(initialState, { type: 'DOES_NOT_EXIST' });
    expect(state).toBe(initialState); // same reference — no copy made
  });
});

// ── isStepComplete helper ─────────────────────────────────────────────────────

describe('isStepComplete', () => {
  it('returns false when no items checked', () => {
    expect(isStepComplete(0, initialState.checklist.checked)).toBe(false);
  });

  it('returns true when all required items for step 0 are checked', () => {
    const state = stateWithStepChecked(0);
    expect(isStepComplete(0, state.checklist.checked)).toBe(true);
  });

  it('returns false when only some required items are checked', () => {
    const step = CHECKLIST_STEPS[0];
    const checked = { ...initialState.checklist.checked };
    // Check only the first required item
    checked[step.items[0].key] = true;
    expect(isStepComplete(0, checked)).toBe(false);
  });

  it('returns false for an invalid step id', () => {
    expect(isStepComplete(99, initialState.checklist.checked)).toBe(false);
  });
});

// ── HTF_MAP ───────────────────────────────────────────────────────────────────

describe('HTF_MAP', () => {
  it('15min maps to 1h', () => {
    expect(HTF_MAP['15min']).toBe('1h');
  });

  it('1h maps to 4h', () => {
    expect(HTF_MAP['1h']).toBe('4h');
  });

  it('4h maps to daily', () => {
    expect(HTF_MAP['4h']).toBe('daily');
  });

  it('daily maps to weekly', () => {
    expect(HTF_MAP['daily']).toBe('weekly');
  });

  it('weekly maps to null (no higher timeframe)', () => {
    expect(HTF_MAP['weekly']).toBeNull();
  });
});

// ── CHECKLIST_STEPS structure ─────────────────────────────────────────────────

describe('CHECKLIST_STEPS structure', () => {
  it('has exactly 5 steps', () => {
    expect(CHECKLIST_STEPS).toHaveLength(5);
  });

  it('each step has required fields', () => {
    for (const step of CHECKLIST_STEPS) {
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('title');
      expect(step).toHaveProperty('interval');
      expect(step).toHaveProperty('overlays');
      expect(step).toHaveProperty('items');
      expect(step).toHaveProperty('requiredCount');
    }
  });

  it('step ids are sequential from 0', () => {
    CHECKLIST_STEPS.forEach((step, i) => {
      expect(step.id).toBe(i);
    });
  });

  it('each step has at least one required item', () => {
    for (const step of CHECKLIST_STEPS) {
      const required = step.items.filter((item) => item.required);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it('each item key is unique across all steps', () => {
    const keys = CHECKLIST_STEPS.flatMap((s) => s.items.map((item) => item.key));
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
