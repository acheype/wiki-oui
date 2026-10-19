import { describe, expect, it } from "vitest";
import { isSettled } from "./formats";

const DATE_TIME = { format: "datetime" } as const;

// When the entry form may judge a value while it is being entered: once
// nothing is left half-typed (docs/forms.md § Saisie).
describe("isSettled", () => {
  it("settles an empty value and a complete one", () => {
    expect(isSettled(DATE_TIME, "")).toBe(true);
    expect(isSettled(DATE_TIME, undefined)).toBe(true);
    expect(isSettled(DATE_TIME, "2026-11-03T18:30")).toBe(true);
    expect(isSettled(DATE_TIME, "2026-11-03")).toBe(true);
    expect(isSettled({ format: "time" }, "18:30")).toBe(true);
  });

  it("waits while a time is awaited or half typed", () => {
    expect(isSettled(DATE_TIME, "2026-11-03T")).toBe(false);
    expect(isSettled(DATE_TIME, "2026-11-03T18:3")).toBe(false);
    expect(isSettled(DATE_TIME, "18:")).toBe(false);
  });

  it("settles a period with both bounds complete, or none", () => {
    expect(isSettled(DATE_TIME, { start: "2026-11-03T18:30", end: "2026-11-03T17:00" })).toBe(true);
    expect(isSettled(DATE_TIME, { start: "", end: "" })).toBe(true);
  });

  it("waits while a period has a bound left to fill", () => {
    expect(isSettled(DATE_TIME, { start: "2026-11-03T18:30", end: "" })).toBe(false);
    expect(isSettled(DATE_TIME, { start: "2026-11-03T18:30", end: "2026-11-03T" })).toBe(false);
  });

  it("waits for the date of a field that expects one", () => {
    expect(isSettled(DATE_TIME, "18:30")).toBe(false);
    expect(isSettled(DATE_TIME, { start: "18:30", end: "20:00" })).toBe(false);
  });
});
