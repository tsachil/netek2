import { DayState, type DayStateValue } from "./prismaEnums";

export const allowedTransitions: Record<DayStateValue, DayStateValue[]> = {
  CLOSED: [DayState.LOADING],
  LOADING: [DayState.OPEN, DayState.CLOSED],
  OPEN: [DayState.CLOSING],
  CLOSING: [DayState.RECONCILING],
  RECONCILING: [DayState.CLOSED]
};

export function isValidDayTransition(currentState: DayStateValue, nextState: DayStateValue) {
  if (currentState === nextState) {
    return true;
  }
  return allowedTransitions[currentState].includes(nextState);
}
