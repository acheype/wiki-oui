import { describe, expect, it } from "vitest";
import {
  SUGGESTION_LIMIT,
  alignSpelling,
  rankByFrequency,
  suggestValues,
} from "./suggested-values";

describe("rankByFrequency", () => {
  it("orders distinct values by descending count", () => {
    expect(
      rankByFrequency(["atelier", "sport", "atelier", "atelier", "sport"])
    ).toEqual(["atelier", "sport"]);
  });

  it("settles ties alphabetically", () => {
    expect(rankByFrequency(["sport", "atelier"])).toEqual(["atelier", "sport"]);
  });

  it("trims each occurrence and ignores the empty ones", () => {
    expect(rankByFrequency([" atelier ", "atelier", "  ", ""])).toEqual([
      "atelier",
    ]);
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

describe("suggestValues", () => {
  it("shows everything on an empty draft, up to the limit", () => {
    expect(
      suggestValues({ candidates: ["atelier", "sport"], draft: "", placed: [] })
    ).toEqual(["atelier", "sport"]);
  });

  it("keeps only the head of a long list on an empty draft", () => {
    const candidates = Array.from(
      { length: SUGGESTION_LIMIT + 4 },
      (_, i) => `tag-${i}`
    );
    expect(suggestValues({ candidates, draft: "", placed: [] })).toEqual(
      candidates.slice(0, SUGGESTION_LIMIT)
    );
  });

  it("narrows to candidates whose fold contains the draft's", () => {
    expect(
      suggestValues({
        candidates: ["Atelier vélo", "Atelier couture", "Sport"],
        draft: "atel",
        placed: [],
      })
    ).toEqual(["Atelier vélo", "Atelier couture"]);
  });

  it("drops what is already placed, compared by fold", () => {
    expect(
      suggestValues({
        candidates: ["Atelier", "Sport"],
        draft: "",
        placed: ["atelier"],
      })
    ).toEqual(["Sport"]);
  });

  it("puts the candidate that exactly matches the draft first", () => {
    expect(
      suggestValues({
        candidates: ["chaton-2", "Chaton"],
        draft: "chaton",
        placed: [],
      })
    ).toEqual(["Chaton", "chaton-2"]);
  });

  it("puts the candidates starting with the draft before those containing it", () => {
    expect(
      suggestValues({
        candidates: ["chat-perdu", "perroquet", "super", "perle"],
        draft: "per",
        placed: [],
      })
    ).toEqual(["perroquet", "perle", "chat-perdu", "super"]);
  });

  it("orders exact match, then starts, then contains, before the limit", () => {
    const containing = Array.from(
      { length: SUGGESTION_LIMIT },
      (_, i) => `x-atelier-${i}`
    );
    expect(
      suggestValues({
        candidates: [...containing, "atelier-bois", "atelier"],
        draft: "atelier",
        placed: [],
      })
    ).toEqual(["atelier", "atelier-bois", ...containing].slice(0, SUGGESTION_LIMIT));
  });

  it("does not offer an exact match that is already placed", () => {
    expect(
      suggestValues({
        candidates: ["Atelier", "Atelier vélo"],
        draft: "atelier",
        placed: ["atelier"],
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
