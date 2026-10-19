import { describe, expect, it } from "vitest";
import {
  dateBlockCaption,
  formatTemporalValue,
  temporalSpan,
} from "./temporal-value";

describe("formatTemporalValue (docs/forms.md § Affichage)", () => {
  it("writes a date and a time in French", () => {
    expect(formatTemporalValue("2026-11-03T18:30")).toBe(
      "3 novembre 2026 à 18h30"
    );
  });

  it("writes a date alone", () => {
    expect(formatTemporalValue("2026-11-03")).toBe("3 novembre 2026");
  });

  it("writes a time alone, a full hour without minutes", () => {
    expect(formatTemporalValue("18:30")).toBe("18h30");
    expect(formatTemporalValue("12:00")).toBe("12h");
    expect(formatTemporalValue("09:05")).toBe("9h05");
  });

  it("factorizes a period over several days of one month", () => {
    expect(
      formatTemporalValue({ start: "2026-11-03", end: "2026-11-05" })
    ).toBe("du 3 au 5 novembre 2026");
  });

  it("keeps each month, and each year, only where they differ", () => {
    expect(
      formatTemporalValue({ start: "2026-10-30", end: "2026-11-02" })
    ).toBe("du 30 octobre au 2 novembre 2026");
    expect(
      formatTemporalValue({ start: "2026-12-30", end: "2027-01-02" })
    ).toBe("du 30 décembre 2026 au 2 janvier 2027");
  });

  it("writes each bound in full when the period has times", () => {
    expect(
      formatTemporalValue({ start: "2026-11-03T18:30", end: "2026-11-05T12:00" })
    ).toBe("du 3 novembre 2026 à 18h30 au 5 novembre 2026 à 12h");
  });

  it("writes a one-day period as one date", () => {
    expect(
      formatTemporalValue({ start: "2026-11-03", end: "2026-11-03" })
    ).toBe("3 novembre 2026");
    expect(
      formatTemporalValue({ start: "2026-11-03T18:30", end: "2026-11-03T22:00" })
    ).toBe("3 novembre 2026, de 18h30 à 22h");
  });

  it("writes a time range", () => {
    expect(formatTemporalValue({ start: "09:00", end: "12:30" })).toBe(
      "de 9h à 12h30"
    );
  });

  it("writes nothing for an empty value", () => {
    expect(formatTemporalValue(undefined)).toBe("");
    expect(formatTemporalValue("")).toBe("");
    expect(formatTemporalValue({ start: "", end: "" })).toBe("");
  });

  it("gives back an unreadable string as it is", () => {
    expect(formatTemporalValue("14/03/1992")).toBe("14/03/1992");
  });
});

describe("temporalSpan", () => {
  it("spans a date-and-time value as a one-instant event", () => {
    expect(temporalSpan("2026-11-03T18:30")).toEqual({
      start: "2026-11-03T18:30",
      end: "2026-11-03T18:30",
      allDay: false,
    });
  });

  it("spans a Période over its two bounds", () => {
    expect(temporalSpan({ start: "2026-11-03", end: "2026-11-05" })).toEqual({
      start: "2026-11-03",
      end: "2026-11-05",
      allDay: true,
    });
  });

  it("reads a pseudo-field timestamp as its day", () => {
    expect(temporalSpan("2026-10-18T09:12:44.512Z")).toEqual({
      start: "2026-10-18",
      end: "2026-10-18",
      allDay: true,
    });
  });

  it("has no span for a time alone, or no value", () => {
    expect(temporalSpan("18:30")).toBeNull();
    expect(temporalSpan({ start: "09:00", end: "12:00" })).toBeNull();
    expect(temporalSpan(undefined)).toBeNull();
  });
});

describe("dateBlockCaption", () => {
  const span = (start: string, end: string, allDay = !start.includes("T")) => ({
    start,
    end,
    allDay,
  });

  it("says nothing for an all-day single day, which the block already shows", () => {
    expect(dateBlockCaption(span("2026-11-03", "2026-11-03"))).toBe("");
  });

  it("gives the time, or the time range, of a single day", () => {
    expect(dateBlockCaption(span("2026-11-03T18:30", "2026-11-03T18:30"))).toBe("18h30");
    expect(dateBlockCaption(span("2026-11-03T18:30", "2026-11-03T22:00"))).toBe(
      "de 18h30 à 22h"
    );
  });

  it("gives the last day of a period over several days", () => {
    expect(dateBlockCaption(span("2026-10-31", "2026-11-01"))).toBe(
      "Jusqu'au 1er novembre"
    );
    expect(dateBlockCaption(span("2026-12-03T08:30", "2026-12-04T16:00"))).toBe(
      "8h30, jusqu'au 4 décembre à 16h"
    );
  });
});
