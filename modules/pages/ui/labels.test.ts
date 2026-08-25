import { describe, expect, it } from "vitest";
import {
  ownerLine,
  signInLockoutWarning,
  ownerTransferNote,
  ownerTransferWarning,
  ruleSummary,
} from "./labels";

const MARIE_FLOOR = { owner: { username: "marie-durand", name: "Marie Durand" } };
const NO_OWNER_FLOOR = { owner: null };

describe("ownerLine", () => {
  it("names the owner with the word the rights themselves use", () => {
    expect(ownerLine("Marie Durand")).toBe("Propriétaire\u00A0: Marie Durand");
  });

  // Saying nothing would read as a line that failed to load, where the
  // absence of an owner is itself worth knowing: it is what leaves the page
  // to the administrators alone.
  it("says « Anonyme » when the page has no owner, never nothing", () => {
    expect(ownerLine(null)).toBe("Propriétaire\u00A0: Anonyme");
  });
});

describe("what handing a page over says", () => {
  it("agrees with the count, pronoun and all", () => {
    expect(ownerTransferNote(1)).toBe(
      "La personne choisie deviendra responsable de cette page. Elle pourra la voir, la modifier et définir qui peut y accéder."
    );
    expect(ownerTransferNote(12)).toBe(
      "La personne choisie deviendra responsable de ces 12 pages. Elle pourra les voir, les modifier et définir qui peut y accéder."
    );
  });

  it("warns that giving is final, whatever the count", () => {
    expect(ownerTransferWarning(1)).toBe(
      "Une fois le transfert effectué, seul le nouveau propriétaire, ou un administrateur, pourra transférer à nouveau la propriété de cette page."
    );
    expect(ownerTransferWarning(12)).toContain("la propriété de ces pages.");
  });
});

describe("ruleSummary", () => {
  const directory = {
    people: [
      { username: "paul-riva", name: "Paul Riva" },
      { username: "jean-martin", name: "Jean Martin" },
    ],
    groups: [{ slug: "bureau", name: "Bureau" }],
  };

  it("names the two open scopes in the room a column leaves", () => {
    expect(ruleSummary({ scope: "everyone" }, MARIE_FLOOR, directory)).toBe("Tous");
    expect(ruleSummary({ scope: "authenticated" }, MARIE_FLOOR, directory)).toBe(
      "Connectés"
    );
  });

  it("reads an empty « seulement » list as the floor it stands on", () => {
    expect(ruleSummary({ scope: "restricted" }, MARIE_FLOOR, directory)).toBe(
      "Le propriétaire"
    );
    expect(ruleSummary({ scope: "restricted" }, NO_OWNER_FLOOR, directory)).toBe(
      "@Admins"
    );
  });

  it("names whoever is listed, and counts the rest", () => {
    expect(
      ruleSummary(
        { scope: "restricted", groupSlugs: ["bureau"] },
        MARIE_FLOOR,
        directory
      )
    ).toBe("@Bureau");
    expect(
      ruleSummary(
        {
          scope: "restricted",
          usernames: ["paul-riva", "jean-martin"],
          groupSlugs: ["bureau"],
        },
        MARIE_FLOOR,
        directory
      )
    ).toBe("Paul Riva +2");
  });
});

// The one refusal a wiki cannot take back (issue #20). No page is exempt from
// its rights any more, sign-in pages included — which is what makes the
// setting mean something, and what makes this one worth a word before the
// click.
describe("signInLockoutWarning", () => {
  const LOT = ["compte-rendu", "connexion", "annuaire"];

  it("says nothing while the read stays open to everyone", () => {
    expect(signInLockoutWarning(LOT, { scope: "everyone" })).toBeNull();
  });

  it("says nothing when the sense is not being replaced at all", () => {
    expect(signInLockoutWarning(LOT, undefined)).toBeNull();
  });

  it("says nothing about a lot that holds no account page", () => {
    expect(
      signInLockoutWarning(["compte-rendu", "annuaire"], { scope: "authenticated" })
    ).toBeNull();
  });

  // Three of the four account pages lock the wiki, not four. Free sign-up is
  // closed by default and opens no way back into an account that exists.
  it("says nothing about the free sign-up page", () => {
    expect(signInLockoutWarning(["inscription"], { scope: "restricted" })).toBeNull();
  });

  // Every recovery link lands on `invitation`, a forgotten password as much as
  // an invitation (modules/accounts/access/guards.ts) — closing it closes the
  // only way back for whoever has lost their password.
  it("warns about the page every recovery link lands on", () => {
    expect(signInLockoutWarning(["invitation"], { scope: "restricted" })).toContain(
      "récupérer"
    );
  });

  it("warns about the page that asks for a reset", () => {
    expect(
      signInLockoutWarning(["mot-de-passe-oublie"], { scope: "restricted" })
    ).not.toBeNull();
  });

  it("warns, and names the page, as soon as the read narrows", () => {
    const warning = signInLockoutWarning(LOT, { scope: "authenticated" });
    expect(warning).toContain("connexion");
    expect(warning).toContain("administrateurs compris");
    // The lot's other pages are nobody's business here: the warning is about
    // the one page that would lock the wiki.
    expect(warning).not.toContain("compte-rendu");
  });

  it("names every account page a lot would close, and agrees with the count", () => {
    const warning = signInLockoutWarning(["connexion", "invitation"], {
      scope: "restricted",
    });
    expect(warning).toContain("connexion");
    expect(warning).toContain("invitation");
    expect(warning).toContain("Les pages");
    expect(warning).toContain("servent");
    expect(warning).toContain("leur lecture");
  });

  it("agrees in the singular for one page", () => {
    const warning = signInLockoutWarning(["connexion"], { scope: "restricted" });
    expect(warning).toContain("La page");
    expect(warning).toContain("» sert à");
    expect(warning).toContain("sa lecture");
  });

  // Two sentences, the second being the consequence: the note renders the
  // break, so it has to survive the string.
  it("keeps the consequence on its own line", () => {
    expect(signInLockoutWarning(["connexion"], { scope: "restricted" })).toContain(
      ".\nSi toutes les sessions"
    );
  });
});
