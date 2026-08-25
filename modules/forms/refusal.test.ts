import { describe, expect, it } from "vitest";
import { scopeRefusal } from "./refusal";

describe("why a rule refuses, in words", () => {
  it("words nothing for a rule that refuses nobody", () => {
    expect(scopeRefusal({ scope: "everyone" }, [])).toBeNull();
  });

  it("names the level, not the person", () => {
    expect(scopeRefusal({ scope: "authenticated" }, [])).toBe(
      "Réservé aux personnes connectées."
    );
  });

  it("names the groups a « seulement » is posed for", () => {
    const rule = { scope: "restricted", groupSlugs: ["bureau"] } as const;
    expect(scopeRefusal(rule, ["Bureau"])).toBe("Réservé à @Bureau.");
    expect(scopeRefusal(rule, ["Bureau", "Trésorerie"])).toBe(
      "Réservé à @Bureau et @Trésorerie."
    );
  });

  it("stays vague when only people are named, who are nobody's business", () => {
    const rule = { scope: "restricted", usernames: ["marie-durand"] } as const;
    expect(scopeRefusal(rule, [])).toBe(
      "Réservé aux personnes autorisées."
    );
  });
});
