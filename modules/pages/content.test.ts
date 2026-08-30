import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, person } = vi.hoisted(() => ({
  db: {
    page: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    pageAcl: { deleteMany: vi.fn(), createMany: vi.fn() },
    revision: { create: vi.fn() },
    form: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  person: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// The session, not the verdicts: modules/permissions/person.ts runs for real
// here, so what the code under test asks it is the rule itself and not a
// second spelling of it in this file.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/accounts/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        person.current.username
          ? { user: { username: person.current.username, name: person.current.username } }
          : null,
    },
  },
}));
vi.mock("@/modules/permissions/groups-directory", () => ({
  currentGroupSlugs: async () => person.current.groupSlugs,
  existingPrincipals: async () => ({ usernames: new Set(), groupSlugs: new Set() }),
  grantTarget: async () => null,
  listDirectory: async () => ({ people: [], groups: [] }),
}));

const { isRefused } = await import("@/modules/pages/rights");
const { currentReadableWhere } = await import("@/modules/permissions/person");
const {
  getLayoutContents,
  getRawContent,
  hiddenIfNoAccess,
  isSlugReadable,
  listPageTags,
} = await import("@/modules/pages/content");

/** A page Marie owns, closed to everyone else in both senses. */
const MARIES_PAGE = {
  id: "page-1",
  slug: "compte-rendu",
  ownerUsername: "marie-durand",
  readScope: "restricted",
  writeScope: "restricted",
  acls: [],
  owner: { name: "Marie Durand", username: "marie-durand" },
  formId: null,
  tags: [],
  current: null,
};

function signedInAs(username: string | null, groupSlugs: string[] = []) {
  person.current = { username, groupSlugs };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs("jean-martin"); // never the owner, never an administrator
  db.page.findUnique.mockResolvedValue(MARIES_PAGE);
  db.page.findUniqueOrThrow.mockResolvedValue(MARIES_PAGE);
  db.page.findMany.mockResolvedValue([MARIES_PAGE]);
  db.form.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    typeof run === "function" ? run(db) : undefined
  );
});

// The page-tag suggestion (issue #15) reads through the same clause every
// other list reads through — not the unnest of ADR 0007, which would leave
// the read filter behind (see modules/pages/content.ts listPageTags).
describe("listPageTags", () => {
  it("reads through the current read filter, ranked by frequency", async () => {
    db.page.findMany.mockResolvedValue([
      { tags: ["Atelier", "Atelier"] },
      { tags: ["atelier"] },
      { tags: ["Sport"] },
    ]);
    const result = await listPageTags();
    expect(db.page.findMany).toHaveBeenCalledWith({
      where: await currentReadableWhere(),
      select: { tags: true },
    });
    expect(result).toEqual(["Atelier", "Sport"]);
  });
});

// hideIfNoAccess (docs/permissions.md § Liens et boutons vers l'inaccessible,
// issue #13): the check a link, a button or an iframe runs before deciding
// whether to render at all.
describe("isSlugReadable", () => {
  it("reads a page open to everyone", async () => {
    db.page.findUnique.mockResolvedValue({
      ownerUsername: null,
      readScope: "everyone",
      writeScope: "everyone",
      acls: [],
    });
    expect(await isSlugReadable("compte-rendu")).toBe(true);
  });

  it("refuses a page restricted to someone else", async () => {
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await isSlugReadable("compte-rendu")).toBe(false);
  });

  it("reads a page whose owner is the current person", async () => {
    signedInAs("marie-durand");
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await isSlugReadable("compte-rendu")).toBe(true);
  });

  it("reads a missing page — a dead link is page-lint's business, not this one's", async () => {
    db.page.findUnique.mockResolvedValue(null);
    expect(await isSlugReadable("nulle-part")).toBe(true);
  });

  // No slug is exempt any more (issue #20): the wiki kept a list of pages that
  // answered to everyone whatever was posed on them, and `connexion` was on
  // it. An administrator who closed that page saw nothing happen, which is a
  // worse surprise than a wiki that does what its rights say.
  it("hides a link to an account page its rights refuse, like any other", async () => {
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await isSlugReadable("connexion")).toBe(false);
  });
});

// The one guard modules/pages/wiki-components/{wiki-link,button,iframe}.tsx all ask through
// before deciding whether to render at all — a link/button/iframe vanishes
// only when every one of these holds.
describe("hiddenIfNoAccess", () => {
  it("never hides when the setting is off", async () => {
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await hiddenIfNoAccess("compte-rendu", false)).toBe(false);
  });

  it("never hides an external target", async () => {
    expect(
      await hiddenIfNoAccess("https://exemple.org", true)
    ).toBe(false);
    expect(db.page.findUnique).not.toHaveBeenCalled();
  });

  it("never hides an empty link", async () => {
    expect(await hiddenIfNoAccess("", true)).toBe(false);
  });

  it("never hides a target that does not parse as a wiki href", async () => {
    // Malformed rather than merely missing (isSlugReadable's own case): not
    // this guard's job to guess a slug out of it either.
    expect(await hiddenIfNoAccess("javascript:alert(1)", true)).toBe(false);
    expect(db.page.findUnique).not.toHaveBeenCalled();
  });

  it("hides a restricted target the person may not read", async () => {
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await hiddenIfNoAccess("compte-rendu", true)).toBe(true);
  });

  it("keeps a target the person may read", async () => {
    signedInAs("marie-durand");
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await hiddenIfNoAccess("compte-rendu", true)).toBe(false);
  });

  it("keeps a handler href, judged on the page it names", async () => {
    db.page.findUnique.mockResolvedValue(MARIES_PAGE);
    expect(await hiddenIfNoAccess("compte-rendu/edit", true)).toBe(true);
    expect(db.page.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "compte-rendu" } })
    );
  });
});

// /{slug}/raw (docs/permissions.md): born inside the access layer (ADR 0025), so its
// own refusal and its own cut are exercised the same way as every other read.
describe("getRawContent", () => {
  const BUREAU = { scope: "restricted", groupSlugs: ["bureau"] } as const;
  const CREATED_AT = new Date("2026-01-05T10:00:00.000Z");
  const EDITED_AT = new Date("2026-02-10T09:00:00.000Z");
  const EVERYONE = { scope: "everyone", usernames: [], groupSlugs: [] };
  const RESTRICTED = { scope: "restricted", usernames: [], groupSlugs: [] };
  const EDITOR = { name: "Jean Martin", username: "jean-martin" };

  /** A payroll form: a name anyone reads, a salary @Bureau's alone. */
  const PAYROLL_SCHEMA = {
    fields: [
      { type: "title", name: "title", label: "Titre" },
      { type: "text", name: "nom", label: "Nom" },
      { type: "text", name: "salaire", label: "Salaire", readAcl: BUREAU, writeAcl: BUREAU },
    ],
  };

  const OPEN_PAGE = {
    ...MARIES_PAGE,
    createdAt: CREATED_AT,
    readScope: "everyone",
  };

  it("answers null on a slug nobody wrote", async () => {
    db.page.findUnique.mockResolvedValue(null);
    expect(await getRawContent("inconnue")).toBeNull();
  });

  it("refuses a page this person may not read", async () => {
    db.page.findUnique.mockResolvedValue({
      ...MARIES_PAGE,
      createdAt: CREATED_AT,
      form: null,
    });
    const raw = await getRawContent("compte-rendu");
    expect(isRefused(raw!)).toBe(true);
  });

  const METADATA = {
    "created-at": CREATED_AT,
    owner: "Marie Durand",
    "last-edited-at": EDITED_AT,
    "last-edited-by": "Jean Martin",
    "read-scope": EVERYONE,
    "write-scope": RESTRICTED,
  };

  it("serves an MDX page's content, kind and metadata alongside it", async () => {
    db.page.findUnique.mockResolvedValue({
      ...OPEN_PAGE,
      form: null,
      current: { content: "# Bonjour", createdAt: EDITED_AT, author: EDITOR },
    });
    const raw = await getRawContent("compte-rendu");
    expect(raw).toEqual({ kind: "page", content: "# Bonjour", metadata: METADATA });
  });

  it("serves a fiche's fields ordered by the form, form-id inside metadata, fields cut", async () => {
    db.page.findUnique.mockResolvedValue({
      ...OPEN_PAGE,
      formId: "form-1",
      form: { id: "form-1", slug: "paie", schema: PAYROLL_SCHEMA },
      // Deliberately out of form order, to prove getRawContent rebuilds it —
      // storage (jsonb) makes no promise about the order it hands back.
      current: {
        data: { salaire: 42000, title: "Paie", nom: "Marie" },
        createdAt: EDITED_AT,
        author: EDITOR,
      },
    });

    const raw = await getRawContent("paie-marie");
    expect(raw).toEqual({
      kind: "entry",
      fields: { title: "Paie", nom: "Marie" },
      metadata: { "form-id": "paie", ...METADATA },
    });
    expect(
      raw && "fields" in raw ? Object.keys(raw.fields) : []
    ).toEqual(["title", "nom"]);
    expect(
      raw && "metadata" in raw ? Object.keys(raw.metadata) : []
    ).toEqual(["form-id", ...Object.keys(METADATA)]);

    signedInAs("jean-martin", ["bureau"]);
    const seenByBureau = await getRawContent("paie-marie");
    expect(
      seenByBureau && "fields" in seenByBureau
        ? Object.keys(seenByBureau.fields)
        : []
    ).toEqual(["title", "nom", "salaire"]);
  });
});

// The site's chrome obeys the rights like any other content (issue #20). The
// case that matters is the private wiki: an administrator closes every page
// to visitors, and the menu — which names every page — has to close with
// them.
describe("getLayoutContents", () => {
  /** A layout page, with the read scope the test poses on it. */
  function slot(slug: string, readScope: string) {
    return {
      slug,
      ownerUsername: null,
      readScope,
      writeScope: "restricted",
      acls: [],
      owner: null,
      current: { content: `contenu de ${slug}` },
    };
  }

  it("serves a slot the person may read", async () => {
    person.current = { username: null, groupSlugs: [] };
    db.page.findMany.mockResolvedValue([slot("page-menu-haut", "everyone")]);
    expect((await getLayoutContents()).topMenu).toEqual({
      content: "contenu de page-menu-haut",
    });
  });

  it("hands back an empty slot when the rights refuse it", async () => {
    person.current = { username: null, groupSlugs: [] };
    db.page.findMany.mockResolvedValue([slot("page-menu-haut", "authenticated")]);
    // Empty, and above all not « missing »: a refusal is a right being
    // applied, and saying so would be a second, contradictory story.
    expect((await getLayoutContents()).topMenu).toEqual({ content: "" });
  });

  it("serves that same slot to whoever the rights let through", async () => {
    person.current = { username: "marie-durand", groupSlugs: [] };
    db.page.findMany.mockResolvedValue([slot("page-menu-haut", "authenticated")]);
    expect((await getLayoutContents()).topMenu).toEqual({
      content: "contenu de page-menu-haut",
    });
  });

  // A layout page is a special page, so a missing one means wiki.config.ts
  // names a slug the wiki does not have — something to fix, not something an
  // author did. It is told apart from an empty slot so that the layout can
  // say so to an administrator, and to nobody else.
  it("names the slug when no page answers to it", async () => {
    person.current = { username: "wiki-admin", groupSlugs: ["admins"] };
    db.page.findMany.mockResolvedValue([]);
    expect((await getLayoutContents()).topMenu).toEqual({
      missingSlug: "page-menu-haut",
    });
  });
});
