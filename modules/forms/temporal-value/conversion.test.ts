import { describe, expect, it } from "vitest";
import type { FormDescriptor } from "../form-descriptor";
import {
  convertEntryValues,
  convertTemporalValue,
  temporalModeChanges,
} from "./conversion";

// The grid of docs/forms.md § Changer le mode d'un champ: convert when it
// invents nothing, keep the value otherwise.
describe("convertTemporalValue", () => {
  const dateAndTime = { format: "datetime", optionalTime: true } as const;
  const timeRequired = { format: "datetime", optionalTime: false } as const;
  const dateOnly = { format: "date" } as const;
  const timeOnly = { format: "time" } as const;

  it("drops the time when Date et heure becomes Date", () => {
    expect(
      convertTemporalValue("2026-11-03T18:30", dateOnly)
    ).toEqual({ value: "2026-11-03", outcome: "timeDropped" });
  });

  it("leaves an all-day value alone when Date et heure becomes Date", () => {
    expect(convertTemporalValue("2026-11-03", dateOnly)).toEqual({
      value: "2026-11-03",
      outcome: null,
    });
  });

  it("keeps a date as all day when Date becomes Date et heure", () => {
    expect(convertTemporalValue("2026-11-03", dateAndTime)).toEqual({
      value: "2026-11-03",
      outcome: null,
    });
  });

  it("keeps a date without time when the time becomes required", () => {
    expect(convertTemporalValue("2026-11-03", timeRequired)).toEqual({
      value: "2026-11-03",
      outcome: "timeMissing",
    });
  });

  it("empties the value between a date mode and Heure", () => {
    expect(convertTemporalValue("2026-11-03T18:30", timeOnly)).toEqual(
      { value: "", outcome: "emptied" }
    );
    expect(convertTemporalValue("18:30", dateOnly)).toEqual({
      value: "",
      outcome: "emptied",
    });
  });

  it("converts both bounds of a Période", () => {
    expect(
      convertTemporalValue(
        { start: "2026-11-03T18:30", end: "2026-11-05T12:00" },
        dateOnly
      )
    ).toEqual({
      value: { start: "2026-11-03", end: "2026-11-05" },
      outcome: "timeDropped",
    });
  });

  it("empties a whole Période that cannot be converted", () => {
    expect(
      convertTemporalValue({ start: "09:00", end: "12:00" }, dateOnly)
    ).toEqual({ value: undefined, outcome: "emptied" });
  });

  it("leaves an empty value alone", () => {
    expect(convertTemporalValue("", timeOnly)).toEqual({
      value: "",
      outcome: null,
    });
    expect(convertTemporalValue(undefined, timeOnly)).toEqual({
      value: undefined,
      outcome: null,
    });
  });
});

describe("temporalModeChanges", () => {
  const form = (field: Record<string, unknown>): FormDescriptor =>
    ({
      fields: [
        { type: "title", name: "title", label: "Titre" },
        { type: "datetime", name: "quand", label: "Quand", ...field },
      ],
    }) as FormDescriptor;

  it("lists a field whose mode changes", () => {
    expect(
      temporalModeChanges(form({}), form({ format: "date" }), new Map())
    ).toEqual([{ name: "quand", label: "Quand", settings: { format: "date" } }]);
  });

  it("follows a field through its rename", () => {
    const before = form({});
    const after = form({ name: "debut", format: "date" });
    expect(
      temporalModeChanges(before, after, new Map([["quand", "debut"]]))
    ).toEqual([{ name: "debut", label: "Quand", settings: { format: "date" } }]);
  });

  it("ignores an unchanged mode, written out or left to its default", () => {
    expect(
      temporalModeChanges(
        form({}),
        form({ format: "datetime", optionalTime: true }),
        new Map()
      )
    ).toEqual([]);
  });

  it("ignores a field added by this save", () => {
    const after: FormDescriptor = {
      fields: [
        ...form({}).fields,
        { type: "datetime", name: "fin", label: "Fin", format: "date" },
      ],
    };
    expect(temporalModeChanges(form({}), after, new Map())).toEqual([]);
  });
});

describe("convertEntryValues", () => {
  it("converts the changed fields and reports what each one lost", () => {
    const changes = [
      { name: "quand", label: "Quand", settings: { format: "date" } },
      { name: "heure", label: "Heure", settings: { format: "date" } },
    ] as const;
    expect(
      convertEntryValues(
        { title: "Concert", quand: "2026-11-03T18:30", heure: "18:30" },
        changes
      )
    ).toEqual({
      data: { title: "Concert", quand: "2026-11-03", heure: "" },
      outcomes: { quand: "timeDropped", heure: "emptied" },
    });
  });

  it("drops the key of an emptied Période", () => {
    const changes = [
      { name: "dates", label: "Dates", settings: { format: "date" } },
    ] as const;
    expect(
      convertEntryValues(
        { title: "Atelier", dates: { start: "09:00", end: "12:00" } },
        changes
      )
    ).toEqual({ data: { title: "Atelier" }, outcomes: { dates: "emptied" } });
  });
});
