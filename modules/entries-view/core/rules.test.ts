import { describe, expect, it } from "vitest";
import {
  applyFilters,
  applyPeriod,
  defaultSearchFields,
  directoryGroups,
  filterCounts,
  hasActiveFilter,
  queryEntries,
  searchEntries,
  sortEntries,
  splitPseudo,
} from "./rules";
import type { ViewEntry } from "../view-entry";
import { temporalSpan } from "@/modules/forms/temporal-value";
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

  it("reads a pseudo-field timestamp as its day", () => {
    const created = [entry("x", "Créée", { $createdAt: "2026-07-19T10:00:00.000Z" })];
    expect(applyPeriod(created, "today", "$createdAt", today)).toHaveLength(1);
  });
});

describe("a Période on the period field (overlap)", () => {
  const today = "2026-11-03";
  const festival = entry("festival", "Festival", {
    dates: { start: "2026-11-01", end: "2026-11-05" },
  });
  const salon = entry("salon", "Salon", {
    dates: { start: "2026-10-20", end: "2026-10-22" },
  });
  const concert = entry("concert", "Concert", {
    dates: { start: "2026-11-20T20:00", end: "2026-11-20T23:00" },
  });
  const all = [festival, salon, concert];
  const slugs = (period: Parameters<typeof applyPeriod>[1]) =>
    applyPeriod(all, period, "dates", today).map((e) => e.slug);

  it("keeps an ongoing period in « À venir »", () => {
    expect(slugs("future")).toEqual(["festival", "concert"]);
  });

  it("keeps in « Passées » only the periods already over", () => {
    expect(slugs("past")).toEqual(["salon"]);
  });

  it("keeps in « Aujourd'hui » the periods containing today", () => {
    expect(slugs("today")).toEqual(["festival"]);
  });

  it("keeps in a window the periods overlapping it", () => {
    expect(slugs("one-week-around")).toEqual(["festival"]);
    expect(slugs("last-30-days")).toEqual(["festival", "salon"]);
  });
});

describe("sorting Date / heure and Période values", () => {
  const by = (list: ViewEntry[], order: "asc" | "desc" = "asc") =>
    sortEntries(list, "quand", order).map((e) => e.slug);

  it("sorts an all-day value before a timed one on the same day", () => {
    const list = [
      entry("soir", "Soir", { quand: "2026-11-03T18:30" }),
      entry("jour", "Jour", { quand: "2026-11-03" }),
      entry("matin", "Matin", { quand: "2026-11-03T09:00" }),
    ];
    expect(by(list)).toEqual(["jour", "matin", "soir"]);
  });

  it("sorts periods by start, then by end", () => {
    const list = [
      entry("long", "Long", { quand: { start: "2026-11-03", end: "2026-11-09" } }),
      entry("tard", "Tard", { quand: { start: "2026-11-04", end: "2026-11-04" } }),
      entry("court", "Court", { quand: { start: "2026-11-03", end: "2026-11-04" } }),
    ];
    expect(by(list)).toEqual(["court", "long", "tard"]);
    expect(by(list, "desc")).toEqual(["tard", "long", "court"]);
  });

  it("sorts time ranges by start, then by end", () => {
    const list = [
      entry("aprem", "Après-midi", { quand: { start: "14:00", end: "17:00" } }),
      entry("long", "Matinée longue", { quand: { start: "09:00", end: "12:30" } }),
      entry("court", "Matinée courte", { quand: { start: "09:00", end: "10:00" } }),
    ];
    expect(by(list)).toEqual(["court", "long", "aprem"]);
  });

  it("sinks an empty period to the end whatever the direction", () => {
    const list = [
      entry("vide", "Vide", { quand: undefined }),
      entry("plein", "Plein", { quand: { start: "2026-11-03", end: "2026-11-03" } }),
    ];
    expect(by(list, "asc")).toEqual(["plein", "vide"]);
    expect(by(list, "desc")).toEqual(["plein", "vide"]);
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

describe("splitPseudo", () => {
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
    expect(temporalSpan(samples[0].values.$createdAt)).not.toBeNull();
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
