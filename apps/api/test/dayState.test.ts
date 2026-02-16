import { describe, it, expect } from "vitest";
import { DayState } from "@prisma/client";
import { isValidDayTransition } from "../src/dayState";

describe("day state transitions", () => {
  it("accepts configured forward transitions", () => {
    expect(isValidDayTransition(DayState.CLOSED, DayState.LOADING)).toBe(true);
    expect(isValidDayTransition(DayState.LOADING, DayState.OPEN)).toBe(true);
    expect(isValidDayTransition(DayState.OPEN, DayState.CLOSING)).toBe(true);
    expect(isValidDayTransition(DayState.CLOSING, DayState.RECONCILING)).toBe(true);
    expect(isValidDayTransition(DayState.RECONCILING, DayState.CLOSED)).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(isValidDayTransition(DayState.CLOSED, DayState.OPEN)).toBe(false);
    expect(isValidDayTransition(DayState.OPEN, DayState.RECONCILING)).toBe(false);
  });

  it("allows no-op transitions", () => {
    expect(isValidDayTransition(DayState.OPEN, DayState.OPEN)).toBe(true);
  });
});
