import { describe, expect, it } from "vitest";
import type { FormDescriptor } from "@/modules/forms/form-descriptor";
import {
  type FormPermissions,
  appliesNothing,
  bornFormPermissions,
  canCreateEntry,
  defaultsPrincipals,
  entryRightsFrom,
  entryRightsImpact,
  entryRightsNote,
  entryRightsVerdict,
  formPermissions,
  holdsRights,
  withKnownPrincipals,
} from "./form-level";
import { type Person, type PageRights, ADMINS_GROUP } from "@/modules/permissions/rules";
import { wikiConfig } from "@/wiki.config";

const VISITOR: Person = { username: null, groupSlugs: [] };
const MARIE: Person = { username: "marie-durand", groupSlugs: [] };
const JEAN: Person = { username: "jean-martin", groupSlugs: ["bureau"] };
const ADMIN: Person = { username: "wiki-admin", groupSlugs: [ADMINS_GROUP.slug] };

const OPEN: FormPermissions = {
  createEntry: { scope: "authenticated" },
  defaultEntryRead: { scope: "everyone" },
  defaultEntryWrite: { scope: "restricted" },
};

function entry(rights: Partial<PageRights> = {}): PageRights {
  return {
    ownerUsername: "marie-durand",
    readScope: "everyone",
    writeScope: "restricted",
    acls: [],
    ...rights,
  };
}

describe("what a form is born with", () => {
  it("copies the wiki's own three rules (ADR 0026)", () => {
    expect(bornFormPermissions()).toEqual({
      createEntry: wikiConfig.permissions.createPage,
      defaultEntryRead: wikiConfig.permissions.defaultPageRead,
      defaultEntryWrite: wikiConfig.permissions.defaultPageWrite,
    });
  });

  it("answers for a descriptor written before the tab existed", () => {
    const descriptor: FormDescriptor = { fields: [] };
    expect(formPermissions(descriptor)).toEqual(bornFormPermissions());
  });

  it("lets what the tab saved win outright", () => {
    const descriptor: FormDescriptor = { fields: [], permissions: OPEN };
    expect(formPermissions(descriptor)).toEqual(OPEN);
  });
});

describe("canCreateEntry", () => {
  it("reads the form's rule, not the wiki's", () => {
    expect(canCreateEntry(VISITOR, OPEN)).toBe(false);
    expect(canCreateEntry(MARIE, OPEN)).toBe(true);
  });

  it("always allows an administrator, whatever the form says", () => {
    const closed: FormPermissions = {
      ...OPEN,
      createEntry: { scope: "restricted" },
    };
    expect(canCreateEntry(ADMIN, closed)).toBe(true);
    expect(canCreateEntry(JEAN, closed)).toBe(false);
  });

  it("counts a group the person reaches by nesting", () => {
    const forBureau: FormPermissions = {
      ...OPEN,
      createEntry: { scope: "restricted", groupSlugs: ["bureau"] },
    };
    expect(canCreateEntry(JEAN, forBureau)).toBe(true);
    expect(canCreateEntry(MARIE, forBureau)).toBe(false);
  });
});

describe("the rights a fiche is born with", () => {
  it("copies the form's two defaults into scopes and rows", () => {
    const permissions: FormPermissions = {
      createEntry: { scope: "everyone" },
      defaultEntryRead: { scope: "restricted", groupSlugs: ["bureau"] },
      defaultEntryWrite: { scope: "restricted", usernames: ["jean-martin"] },
    };
    expect(entryRightsFrom(permissions, "marie-durand")).toEqual({
      readScope: "restricted",
      writeScope: "restricted",
      acls: [
        { kind: "READ", username: null, groupSlug: "bureau" },
        { kind: "WRITE", username: "jean-martin", groupSlug: null },
      ],
    });
  });

  it("drops the rows the fiche's own floor already covers", () => {
    const permissions: FormPermissions = {
      createEntry: { scope: "everyone" },
      defaultEntryRead: {
        scope: "restricted",
        usernames: ["marie-durand"],
        groupSlugs: [ADMINS_GROUP.slug],
      },
      defaultEntryWrite: { scope: "restricted" },
    };
    expect(entryRightsFrom(permissions, "marie-durand").acls).toEqual([]);
  });
});

describe("holdsRights", () => {
  it("says yes when the scopes and the rows already match", () => {
    const rights = entryRightsFrom(OPEN, "marie-durand");
    expect(holdsRights(entry(), rights)).toBe(true);
  });

  it("notices a scope that differs", () => {
    const rights = entryRightsFrom(OPEN, "marie-durand");
    expect(holdsRights(entry({ readScope: "authenticated" }), rights)).toBe(false);
  });

  it("ignores the order the rows come back in", () => {
    const permissions: FormPermissions = {
      ...OPEN,
      defaultEntryRead: {
        scope: "restricted",
        usernames: ["jean-martin"],
        groupSlugs: ["bureau"],
      },
    };
    const held = entry({
      readScope: "restricted",
      acls: [
        { kind: "READ", username: null, groupSlug: "bureau" },
        { kind: "READ", username: "jean-martin", groupSlug: null },
      ],
    });
    expect(holdsRights(held, entryRightsFrom(permissions, "marie-durand"))).toBe(
      true
    );
  });

  it("notices a row the fiche carries and the defaults do not", () => {
    const held = entry({
      acls: [{ kind: "WRITE", username: null, groupSlug: "bureau" }],
    });
    expect(holdsRights(held, entryRightsFrom(OPEN, "marie-durand"))).toBe(false);
  });
});

describe("what applying the defaults would do", () => {
  const others = entry({ ownerUsername: "jean-martin", readScope: "authenticated" });
  const hers = entry({ readScope: "authenticated" });
  const already = entry();

  it("divides the fiches three ways for their owner", () => {
    expect(entryRightsImpact(MARIE, [others, hers, already], OPEN)).toEqual({
      total: 3,
      changed: 1,
      unchanged: 1,
      refused: 1,
    });
  });

  it("refuses an administrator nothing", () => {
    expect(entryRightsImpact(ADMIN, [others, hers, already], OPEN)).toEqual({
      total: 3,
      changed: 2,
      unchanged: 1,
      refused: 0,
    });
  });

  it("keeps the button out of reach when nothing would be written", () => {
    expect(appliesNothing(entryRightsImpact(MARIE, [already], OPEN))).toBe(true);
    expect(appliesNothing(entryRightsImpact(MARIE, [hers], OPEN))).toBe(false);
  });
});

describe("what the confirmation announces", () => {
  it("says a form with no fiche has none, rather than counting zero", () => {
    const note = entryRightsNote({ total: 0, changed: 0, unchanged: 0, refused: 0 });
    expect(note.headline).toBe("Ce formulaire n'a encore aucune fiche.");
    expect(note.lines).toEqual([]);
  });

  it("counts in what changes, and warns that the rest is lost", () => {
    const note = entryRightsNote({ total: 30, changed: 23, unchanged: 7, refused: 0 });
    expect(note.headline).toBe(
      "23 fiches recevront ces accès. Leurs réglages actuels seront remplacés."
    );
    expect(note.lines).toEqual(["7 fiches ont déjà ces accès — rien à changer."]);
  });

  // The possessive agrees with the count, exactly as the verb beside it does.
  it("agrees with itself at one fiche, verb and possessive alike", () => {
    const note = entryRightsNote({ total: 2, changed: 1, unchanged: 1, refused: 0 });
    expect(note.headline).toBe(
      "1 fiche recevra ces accès. Ses réglages actuels seront remplacés."
    );
    expect(note.lines).toEqual(["1 fiche a déjà ces accès — rien à changer."]);
  });

  it("says outright when the action would change nothing", () => {
    const note = entryRightsNote({ total: 5, changed: 0, unchanged: 3, refused: 2 });
    expect(note.headline).toBe("Aucune fiche ne change d'accès.");
    expect(note.lines).toEqual([
      "3 fiches ont déjà ces accès — rien à changer.",
      "2 fiches ne vous appartiennent pas : seul leur propriétaire ou un administrateur peut changer leur accès.",
    ]);
  });

  // A fiche nobody owns belongs to nobody, and « à quelqu'un d'autre » would
  // name a person who does not exist.
  it("says nothing about an owner an unowned fiche does not have", () => {
    const note = entryRightsNote({ total: 1, changed: 0, unchanged: 0, refused: 1 });
    expect(note.lines).toEqual([
      "1 fiche ne vous appartient pas : seul son propriétaire ou un administrateur peut changer son accès.",
    ]);
  });
});

// A default naming an account or a group that has gone since must not grant
// anything on the quiet (ADR 0026) — and the drop has to happen before the
// count as well as before the write, or a row nothing can carry would leave
// its fiche « à changer » for good.
describe("dropping the names that no longer exist", () => {
  const naming: FormPermissions = {
    createEntry: { scope: "authenticated" },
    defaultEntryRead: {
      scope: "restricted",
      usernames: ["marie-durand", "parti"],
      groupSlugs: ["bureau", "dissous"],
    },
    defaultEntryWrite: { scope: "restricted", usernames: ["parti"] },
  };

  it("names what the caller has to ask the database about", () => {
    expect(defaultsPrincipals(naming)).toEqual({
      usernames: ["marie-durand", "parti", "parti"],
      groupSlugs: ["bureau", "dissous"],
    });
  });

  it("keeps only what still exists, and leaves the scopes alone", () => {
    const live = withKnownPrincipals(naming, {
      usernames: new Set(["marie-durand"]),
      groupSlugs: new Set(["bureau"]),
    });
    expect(live.defaultEntryRead).toEqual({
      scope: "restricted",
      usernames: ["marie-durand"],
      groupSlugs: ["bureau"],
    });
    expect(live.defaultEntryWrite).toEqual({
      scope: "restricted",
      usernames: [],
      groupSlugs: [],
    });
  });

  it("leaves the creation rule untouched: it stores no row to break on", () => {
    const live = withKnownPrincipals(naming, {
      usernames: new Set(),
      groupSlugs: new Set(),
    });
    expect(live.createEntry).toEqual(naming.createEntry);
  });

  it("lets a fiche reach « rien à changer » once the dead names are gone", () => {
    const held = entry({
      readScope: "restricted",
      writeScope: "restricted",
      acls: [{ kind: "READ", username: null, groupSlug: "bureau" }],
    });
    // Against the defaults as written, the vanished names make it look as
    // though something were still to write — for ever.
    expect(entryRightsVerdict(ADMIN, held, naming)).toBe("changed");
    const live = withKnownPrincipals(naming, {
      usernames: new Set(),
      groupSlugs: new Set(["bureau"]),
    });
    expect(entryRightsVerdict(ADMIN, held, live)).toBe("unchanged");
  });
});
