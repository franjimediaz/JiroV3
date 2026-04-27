import type { PlanDocument } from "./planTypes";

export const PLAN_HISTORY_LIMIT = 50;

export type PlanHistoryState = {
  current: PlanDocument;
  past: PlanDocument[];
  future: PlanDocument[];
};

export function createInitialHistoryState(current: PlanDocument): PlanHistoryState {
  return { current, past: [], future: [] };
}

export function pushHistoryState(state: PlanHistoryState, next: PlanDocument, limit = PLAN_HISTORY_LIMIT): PlanHistoryState {
  if (serializePlan(state.current) === serializePlan(next)) return state;
  return {
    current: next,
    past: [...state.past, state.current].slice(-limit),
    future: [],
  };
}

export function undoHistoryState(state: PlanHistoryState, limit = PLAN_HISTORY_LIMIT): PlanHistoryState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    current: previous,
    past: state.past.slice(0, -1),
    future: [state.current, ...state.future].slice(0, limit),
  };
}

export function redoHistoryState(state: PlanHistoryState, limit = PLAN_HISTORY_LIMIT): PlanHistoryState {
  const next = state.future[0];
  if (!next) return state;
  return {
    current: next,
    past: [...state.past, state.current].slice(-limit),
    future: state.future.slice(1),
  };
}

function serializePlan(plan: PlanDocument) {
  return JSON.stringify(plan);
}
