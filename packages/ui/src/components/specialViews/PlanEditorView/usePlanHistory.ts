"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanDocument } from "./planTypes";
import { createInitialHistoryState, pushHistoryState, redoHistoryState, undoHistoryState, type PlanHistoryState } from "./planHistoryUtils";

export function usePlanHistory(currentPlan: PlanDocument, onApply: (plan: PlanDocument) => void) {
  const currentRef = useRef(currentPlan);
  const currentKeyRef = useRef(serializePlan(currentPlan));
  const [state, setState] = useState<PlanHistoryState>(createInitialHistoryState(currentPlan));

  useEffect(() => {
    currentRef.current = currentPlan;
    currentKeyRef.current = serializePlan(currentPlan);
  }, [currentPlan]);

  const pushHistory = useCallback((nextPlan: PlanDocument) => {
    const nextKey = serializePlan(nextPlan);
    if (nextKey === currentKeyRef.current) return;

    setState((prev) => pushHistoryState({ ...prev, current: currentRef.current }, nextPlan));
    currentRef.current = nextPlan;
    currentKeyRef.current = nextKey;
    onApply(nextPlan);
  }, [onApply]);

  const undo = useCallback(() => {
    setState((prev) => {
      const nextState = undoHistoryState({ ...prev, current: currentRef.current });
      if (nextState === prev || serializePlan(nextState.current) === currentKeyRef.current) return prev;
      currentRef.current = nextState.current;
      currentKeyRef.current = serializePlan(nextState.current);
      onApply(nextState.current);
      return nextState;
    });
  }, [onApply]);

  const redo = useCallback(() => {
    setState((prev) => {
      const nextState = redoHistoryState({ ...prev, current: currentRef.current });
      if (nextState === prev || serializePlan(nextState.current) === currentKeyRef.current) return prev;
      currentRef.current = nextState.current;
      currentKeyRef.current = serializePlan(nextState.current);
      onApply(nextState.current);
      return nextState;
    });
  }, [onApply]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

function serializePlan(plan: PlanDocument) {
  return JSON.stringify(plan);
}
