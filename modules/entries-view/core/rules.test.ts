import { describe, expect, it } from "vitest";
import {
  applyFilters,
  applyPeriod,
  collectFieldReferences,
  defaultSearchFields,
  directoryGroups,
  entryDay,
  filterCounts,
  hasActiveFilter,
  queryEntries,
  searchEntries,
  sortEntries,
  splitPseudo,
} from "./rules";
import type { ViewEntry } from "../view-entry";
import { sampleEntries, FALLBACK_SAMPLE_DESCRIPTOR } from "@/modules/forms/sample-entries";

const entry = (
  slug: string,
  title: string,
  values: Record<string, unknown> = {}
): ViewEntry => ({ slug, title, values: { title, ...values } });

const entries: ViewEntry[] = [
  entry("ecole", "École du centre", {
    type: "asso",
    themes: ["nature", "culture"],
    date: "2026-07-25",
    nombre: 12,
  }),
  entry("atelier", "Atelier vélo", {
    type: "collectif",
    themes: ["sport"],
    date: "2026-06-01",
    nombre: 3,
  }),
  entry("fete", "Fête de quartier", {
    type: "asso",
    themes: [],
    date: "2026-08-30",
  }),
];

describe("searchEntries", () => {
  it("matches case- and diacritics-insensitively on the given fields", () => {
    expect(searchEntries(entries, "ecole", ["title"]).map((e) => e.slug)).toEqual([
      "ecole",
    ]);
    expect(searchEntries(entries, "VÉLO", ["title"]).map((e) => e.slug)).toEqual([
      "atelier",
    ]);
  });

  it("returns everything on a blank query and nothing on a miss", () => {
    expect(searchEntries(entries, "  ", ["title"])).toHaveLength(3);
    expect(searchEntries(entries, "piscine", ["title"])).toHaveLength(0);
  });
});

describe("filters", () => {
  it("ANDs across filters, ORs within one, arrays matching on overlap", () => {
    expect(
      applyFilters(entries, { type: ["asso"] }).map((e) => e.slug)
    ).toEqual(["ecole", "fete"]);
    expect(
      applyFilters(entries, { type: ["asso"], themes: ["culture", "sport"] }).map(
        (e) => e.slug
      )
    ).toEqual(["ecole"]);
    expect(applyFilters(entries, { type: [] })).toHaveLength(3);
  });

  it("counts an option under the other filters, never under its own", () => {
    const counts = filterCounts(entries, "type", ["asso", "collectif"], {
      type: ["collectif"],
      themes: ["sport"],
    });
    // themes=sport keeps only "atelier": asso would give 0, collectif 1 —
    // the type filter itself does not restrict its own counts.
    expect(counts).toEqual({ asso: 0, collectif: 1 });
  });

  it("hasActiveFilter ignores empty selections", () => {
    expect(hasActiveFilter({ type: [] })).toBe(false);
    expect(hasActiveFilter({ type: ["asso"] })).toBe(true);
  });
});

describe("sortEntries", () => {
  it("sorts text with locale folding, numbers numerically", () => {
    expect(
      sortEntries(entries, "title", "asc").map((e) => e.slug)
    ).toEqual(["atelier", "ecole", "fete"]);
    expect(
      sortEntries(entries, "nombre", "asc").map((e) => e.slug)
    ).toEqual(["atelier", "ecole", "fete"]);
  });

  it("sinks empty values to the end whatever the direction", () => {
    expect(sortEntries(entries, "nombre", "desc").map((e) => e.slug)).toEqual([
      "ecole",
      "atelier",
      "fete",
    ]);
  });
});

describe("applyPeriod", () => {
  const today = "2026-07-19";

  it("keeps the entries inside the period bounds", () => {
    expect(
      applyPeriod(entries, "future", "date", today).map((e) => e.slug)
    ).toEqual(["ecole", "fete"]);
    expect(
      applyPeriod(entries, "past", "date", today).map((e) => e.slug)
    ).toEqual(["atelier"]);
    expect(
      applyPeriod(entries, "one-week-around", "date", today).map((e) => e.slug)
    ).toEqual(["ecole"]);
  });

  it("drops entries without a date on the period field", () => {
    const dateless = [entry("x", "Sans date")];
    expect(applyPeriod(dateless, "future", "date", today)).toHaveLength(0);
  });

  it("reads pseudo-field ISO datetimes as days", () => {
    expect(entryDay("2026-07-19T10:00:00.000Z")).toBe("2026-07-19");
    expect(entryDay("2026-07-19")).toBe("2026-07-19");
    expect(entryDay(42)).toBeNull();
    expect(entryDay("pas-une-date")).toBeNull();
  });
});

describe("queryEntries", () => {
  it("chains search, filters and sort", () => {
    const result = queryEntries(entries, {
      search: "e",
      searchFields: ["title"],
      filters: { type: ["asso"] },
      sortField: "date",
      sortOrder: "desc",
    });
    expect(result.map((e) => e.slug)).toEqual(["fete", "ecole"]);
  });
});

describe("directoryGroups", () => {
  it("groups by folded initial, sorted, non-letters under #", () => {
    const groups = directoryGroups([
      entry("a", "Épicerie"),
      entry("b", "atelier"),
      entry("c", "École"),
      entry("d", "3e lieu"),
    ]);
    expect(groups.map((group) => group.letter)).toEqual(["#", "A", "E"]);
    expect(groups[2].entries.map((e) => e.title)).toEqual(["École", "Épicerie"]);
  });
});

describe("collectFieldReferences", () => {
  it("flattens every field-bearing prop, deduplicated", () => {
    const references = collectFieldReferences({
      view: "grid",
      filters: [{ field: "type" }, { field: "commune" }],
      sortOptions: [{ field: "type" }],
      sortField: "$createdAt",
      search: true,
      searchFields: ["title"],
      fieldProps: ["image", undefined, "type"],
    });
    expect(references.names.sort()).toEqual([
      "$createdAt",
      "commune",
      "image",
      "title",
      "type",
    ]);
    expect(references.all).toBe(false);
    expect(references.allTextFields).toBe(false);
  });

  it("marks the table-without-columns and default-search cases", () => {
    const references = collectFieldReferences({
      view: "table",
      search: true,
      fieldProps: [],
    });
    expect(references.all).toBe(true);
    expect(references.allTextFields).toBe(true);
  });

  it("splits pseudo-fields from real names", () => {
    expect(splitPseudo(["type", "$form", "$createdAt"])).toEqual({
      real: ["type"],
      pseudo: ["$form", "$createdAt"],
    });
  });
});

describe("sampleEntries", () => {
  const today = "2026-07-19";

  it("generates deterministic, plausible entries from a schema", () => {
    const samples = sampleEntries(FALLBACK_SAMPLE_DESCRIPTOR, today);
    expect(samples).toHaveLength(5);
    expect(samples[0].title).not.toBe("");
    expect(samples.map((sample) => sample.slug)).toEqual(
      samples.map((_, i) => `fiche-exemple-${i + 1}`)
    );
    // Same inputs, same outputs: the preview must not flicker.
    expect(sampleEntries(FALLBACK_SAMPLE_DESCRIPTOR, today)).toEqual(samples);
  });

  it("fills option fields from their declared options and dates near today", () => {
    const samples = sampleEntries(FALLBACK_SAMPLE_DESCRIPTOR, today);
    for (const sample of samples) {
      expect(["initiative", "evenement", "lieu"]).toContain(sample.values.type);
      const day = String(sample.values.date);
      expect(Math.abs(Date.parse(day) - Date.parse(today))).toBeLessThan(
        40 * 24 * 3600 * 1000
      );
    }
  });

  it("carries pseudo-fields and the form slug when given", () => {
    const samples = sampleEntries(FALLBACK_SAMPLE_DESCRIPTOR, today, "assos");
    expect(samples[0].values.$form).toBe("assos");
    expect(typeof samples[0].values.$owner).toBe("string");
    expect(entryDay(samples[0].values.$createdAt)).not.toBeNull();
  });

  it("defaultSearchFields sweeps the text-like union fields", () => {
    expect(
      defaultSearchFields([
        { name: "title", label: "Titre", type: "title" },
        { name: "type", label: "Type", type: "list" },
        { name: "description", label: "Description", type: "textarea" },
      ])
    ).toEqual(["title", "description"]);
  });
});
