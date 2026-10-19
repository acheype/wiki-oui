import { describe, expect, it } from "vitest";
import { daysBetween, shiftDay } from "./day";

describe("shiftDay", () => {
  it("moves a day forward and back", () => {
    expect(shiftDay("2026-11-03", 2)).toBe("2026-11-05");
    expect(shiftDay("2026-11-03", -3)).toBe("2026-10-31");
  });

  it("crosses months, years and leap days", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("ignores daylight saving changes", () => {
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("daysBetween", () => {
  it("counts the calendar days from one day to another", () => {
    expect(daysBetween("2026-11-10", "2026-11-12")).toBe(2);
    expect(daysBetween("2026-11-03", "2026-11-03")).toBe(0);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-11-05", "2026-11-03")).toBe(-2);
  });
});
