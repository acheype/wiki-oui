import { describe, expect, it } from "vitest";
import {
  ownerLine,
  signInLockout,
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
describe("signInLockout", () => {
  const LOT = ["compte-rendu", "connexion", "annuaire"];
  const CLOSED = { scope: "restricted" } as const;

  it("says nothing while the read stays open to everyone", () => {
    expect(signInLockout(LOT, { scope: "everyone" })).toBeNull();
  });

  it("says nothing when the sense is not being replaced at all", () => {
    expect(signInLockout(LOT, undefined)).toBeNull();
  });

  // "authenticated" narrows the read just as "restricted" does — only
  // "everyone" leaves the page open to unauthenticated visitors.
  it("warns as soon as the read narrows, not only when restricted", () => {
    const lockout = signInLockout(LOT, { scope: "authenticated" });
    expect(lockout).not.toBeNull();
    expect(lockout?.slugs).toEqual(["connexion"]);
  });

  it("says nothing about a lot that holds no account page", () => {
    expect(signInLockout(["compte-rendu", "annuaire"], CLOSED)).toBeNull();
  });

  // Three of the four account pages lock the wiki, not four. Free sign-up is
  // closed by default and opens no way back into an account that exists.
  it("says nothing about the free sign-up page", () => {
    expect(signInLockout(["inscription"], CLOSED)).toBeNull();
  });

  // Each page is described for what it does, not for what it links to.
  it("says of the sign-in page only that one signs in on it", () => {
    const lockout = signInLockout(["connexion"], CLOSED);
    expect(lockout?.purpose).toBe("La page «\u00A0connexion\u00A0» sert à se connecter.");
    expect(lockout?.consequence).toBe(
      "Désactiver sa lecture empêchera les utilisateurs non connectés de se connecter"
    );
  });

  // requestPasswordReset refuses an address with no account, so
  // `mot-de-passe-oublie` never activates one — only `invitation` does, every
  // link landing there.
  it("says of the reset page that it recovers, and nothing more", () => {
    const lockout = signInLockout(["mot-de-passe-oublie"], CLOSED);
    expect(lockout?.purpose).toContain("sert à récupérer un compte.");
    // « Désactiver sa lecture » holds the word, so the phrase is what counts.
    expect(lockout?.purpose).not.toContain("ou activer");
    expect(lockout?.consequence).not.toContain("d'activer");
  });

  it("says of the invitation page that it recovers or activates", () => {
    const lockout = signInLockout(["invitation"], CLOSED);
    expect(lockout?.purpose).toContain("récupérer ou activer un compte");
    expect(lockout?.consequence).toContain("de récupérer ou d'activer leur compte");
  });

  // The two sentences only `connexion` earns: an administrator is no
  // exception, and the wiki can be shut for good. Closing a recovery page
  // only bites whoever has *also* lost their password.
  it("reserves « nobody gets in » for the sign-in page", () => {
    expect(signInLockout(["connexion"], CLOSED)?.locksEveryoneOut).toBe(true);
    expect(signInLockout(["mot-de-passe-oublie"], CLOSED)?.locksEveryoneOut).toBe(false);
    expect(signInLockout(["invitation"], CLOSED)?.locksEveryoneOut).toBe(false);
    expect(signInLockout(["mot-de-passe-oublie", "invitation"], CLOSED)?.locksEveryoneOut).toBe(
      false
    );
  });

  it("names every account page a lot would close, and agrees with the count", () => {
    const lockout = signInLockout(["connexion", "invitation"], CLOSED);
    expect(lockout?.purpose).toContain("Les pages");
    expect(lockout?.purpose).toContain("servent");
    expect(lockout?.consequence).toContain("leur lecture");
  });

  it("agrees in the singular for one page", () => {
    const lockout = signInLockout(["connexion"], CLOSED);
    expect(lockout?.purpose).toContain("La page");
    expect(lockout?.consequence).toContain("sa lecture");
  });

  // A lot mixing the families joins them without ever saying « ou » twice.
  it("joins the three with one « ou », not three", () => {
    const lockout = signInLockout(
      ["connexion", "mot-de-passe-oublie", "invitation"],
      CLOSED
    );
    expect(lockout?.purpose).toContain("se connecter, récupérer ou activer un compte");
    expect(lockout?.consequence).toContain(
      "de se connecter, de récupérer ou d'activer leur compte"
    );
  });

  // The lot dialog offers to spare them, so it needs to know which they are.
  it("hands back the pages it is about, so a lot can spare them", () => {
    expect(
      signInLockout(["compte-rendu", "connexion", "invitation"], CLOSED)?.slugs
    ).toEqual(["connexion", "invitation"]);
  });
});
