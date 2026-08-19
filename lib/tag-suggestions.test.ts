import { describe, expect, it } from "vitest";
import {
  SUGGESTION_LIMIT,
  alignSpelling,
  fold,
  rankByFrequency,
  suggestTags,
} from "./tag-suggestions";

describe("fold", () => {
  it("matches case- and diacritics-insensitively", () => {
    expect(fold("École")).toBe(fold("ecole"));
  });
});

describe("rankByFrequency", () => {
  it("orders distinct values by descending count", () => {
    expect(
      rankByFrequency(["atelier", "sport", "atelier", "atelier", "sport"])
    ).toEqual(["atelier", "sport"]);
  });

  it("settles ties alphabetically", () => {
    expect(rankByFrequency(["sport", "atelier"])).toEqual(["atelier", "sport"]);
  });

  it("groups spelling variants and keeps the dominant one", () => {
    expect(
      rankByFrequency([
        "Atelier",
        "atelier",
        "Atelier",
        "Atelier",
        "atelier",
        "sport",
      ])
    ).toEqual(["Atelier", "sport"]);
  });
});

describe("suggestTags", () => {
  it("shows everything on an empty draft, up to the limit", () => {
    expect(
      suggestTags({ candidates: ["atelier", "sport"], draft: "", placed: [] })
    ).toEqual(["atelier", "sport"]);
  });

  it("shows nothing on an empty draft past the limit", () => {
    const candidates = Array.from(
      { length: SUGGESTION_LIMIT + 1 },
      (_, i) => `tag-${i}`
    );
    expect(suggestTags({ candidates, draft: "", placed: [] })).toEqual([]);
  });

  it("narrows to candidates whose fold contains the draft's", () => {
    expect(
      suggestTags({
        candidates: ["Atelier vélo", "Atelier couture", "Sport"],
        draft: "atel",
        placed: [],
      })
    ).toEqual(["Atelier vélo", "Atelier couture"]);
  });

  it("drops what is already placed, compared by fold", () => {
    expect(
      suggestTags({
        candidates: ["Atelier", "Sport"],
        draft: "",
        placed: ["atelier"],
      })
    ).toEqual(["Sport"]);
  });

  it("drops the candidate that exactly matches the typed draft", () => {
    expect(
      suggestTags({
        candidates: ["Atelier", "Atelier vélo"],
        draft: "atelier",
        placed: [],
      })
    ).toEqual(["Atelier vélo"]);
  });
});

describe("alignSpelling", () => {
  it("rallies to the spelling already in use", () => {
    expect(alignSpelling("ecole", ["École", "Atelier"])).toBe("École");
  });

  it("keeps the word as typed when no candidate matches", () => {
    expect(alignSpelling("Piscine", ["École", "Atelier"])).toBe("Piscine");
  });
});
