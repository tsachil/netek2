import { DayState } from "@prisma/client";

export const allowedTransitions: Record<DayState, DayState[]> = {
  CLOSED: [DayState.LOADING],
  LOADING: [DayState.OPEN, DayState.CLOSED],
  OPEN: [DayState.CLOSING],
  CLOSING: [DayState.RECONCILING],
  RECONCILING: [DayState.CLOSED]
};

export function isValidDayTransition(currentState: DayState, nextState: DayState) {
  if (currentState === nextState) {
    return true;
  }
  return allowedTransitions[currentState].includes(nextState);
}
