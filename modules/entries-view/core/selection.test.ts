import { describe, expect, it } from "vitest";
import type { EntriesViewData } from "./actions";
import { selectEntries } from "./selection";
import type { ViewEntry } from "../view-entry";

const entry = (slug: string, title: string, rank: number): ViewEntry => ({
  slug,
  title,
  values: { title, rank },
});

const data: EntriesViewData = {
  fields: [{ name: "title", label: "Titre", type: "title" }],
  entries: [
    entry("first", "Première", 5),
    entry("second", "Deuxième", 4),
    entry("third", "Troisième", 3),
    entry("fourth", "Quatrième", 2),
    entry("target", "Assemblée générale", 1),
  ],
  sample: false,
  formNames: { actualites: "Actualités" },
  permissions: {},
};

describe("selectEntries", () => {
  it("searches every eligible entry before applying the result limit", () => {
    const selection = selectEntries(
      data,
      {
        form: "actualites",
        search: true,
        sortField: "rank",
        sortOrder: "desc",
        limit: 2,
      },
      {
        search: "assemblée",
        filters: {},
        sort: null,
        page: 0,
      },
      "2026-09-30"
    );

    expect(selection.results.map((item) => item.slug)).toEqual(["target"]);
    expect(selection.pageEntries.map((item) => item.slug)).toEqual(["target"]);
  });

  it("filters and sorts before the limit, then clamps pagination", () => {
    const selection = selectEntries(
      {
        ...data,
        fields: [
          ...data.fields,
          { name: "date", label: "Date", type: "date" },
        ],
        entries: [
          {
            ...entry("past", "Passée", 10),
            values: { title: "Passée", rank: 10, date: "2026-09-01", type: "news" },
          },
          {
            ...entry("other", "Autre", 9),
            values: { title: "Autre", rank: 9, date: "2026-10-01", type: "event" },
          },
          {
            ...entry("one", "Une", 3),
            values: { title: "Une", rank: 3, date: "2026-10-01", type: "news" },
          },
          {
            ...entry("two", "Deux", 2),
            values: { title: "Deux", rank: 2, date: "2026-10-02", type: "news" },
          },
          {
            ...entry("three", "Trois", 1),
            values: { title: "Trois", rank: 1, date: "2026-10-03", type: "news" },
          },
        ],
      },
      {
        form: "actualites",
        period: "future",
        periodField: "date",
        sortField: "rank",
        sortOrder: "asc",
        limit: 3,
        pageSize: 2,
      },
      {
        search: "",
        filters: { type: ["news"] },
        sort: null,
        page: 9,
      },
      "2026-09-30"
    );

    expect(selection.candidates.map((item) => item.slug)).toEqual([
      "other",
      "one",
      "two",
      "three",
    ]);
    expect(selection.results.map((item) => item.slug)).toEqual([
      "three",
      "two",
      "one",
    ]);
    expect(selection.page).toBe(1);
    expect(selection.pageEntries.map((item) => item.slug)).toEqual(["one"]);
  });
});
