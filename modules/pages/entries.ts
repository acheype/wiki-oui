import { mergedEntryData } from "@/modules/permissions/field-level";
import {
  type EntryData,
  type FormDescriptor,
  computeAutomaticTitle,
  emptyTitleMessage,
  orderedEntryData,
  readEntryData,
} from "@/lib/form-descriptor";
import {
  type EntryRightsImpact,
  type FormPermissions,
  canCreateEntry,
  defaultsPrincipals,
  entryRightsFrom,
  entryRightsImpact,
  entryRightsVerdict,
  withKnownPrincipals,
} from "@/modules/permissions/form-level";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CREATE_ENTRY_REFUSED, storedRights } from "@/modules/permissions/rules";
import { existingPrincipals } from "@/modules/permissions/groups-queries";
import { currentPerson, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import { assertCanWrite, bornWith, mintRevision } from "@/modules/pages/queries";
import {
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  PUBLIC_IDENTITY,
  WITH_RIGHTS,
  currentReadableWhere,
} from "@/modules/pages/rights";

// A fiche's own life cycle: born from a form, read by the formful, its rights
// reset to the form's defaults. Part of ADR 0025's door, alongside
// modules/pages/content.ts, modules/pages/revisions.ts and modules/pages/rights.ts.

/** The entry pages of one form, or of every form when no slug is given. */
export async function listEntryPages(formSlug?: string) {
  return prisma.page.findMany({
    where: {
      AND: [
        formSlug ? { form: { slug: formSlug } } : { formId: { not: null } },
        await currentReadableWhere(),
      ],
    },
    include: { form: true, current: true, owner: PUBLIC_IDENTITY },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The current snapshots of one form's entries, and nothing else: what
 * counting a field's used values needs (issue #15). listEntryPages would
 * drag the form, the owner and an ordering along for rows nobody displays.
 */
export async function listEntrySnapshots(formSlug: string): Promise<unknown[]> {
  const pages = await prisma.page.findMany({
    where: {
      AND: [{ form: { slug: formSlug } }, await currentReadableWhere()],
    },
    select: { current: { select: { data: true } } },
  });
  return pages.map((page) => page.current?.data);
}

// --- a form's defaults, over the fiches already there -------------------------

// Applying a form's defaults to the fiches already there (docs/permissions.md
// § Défauts): the one
// path from a default to what already exists, since the copy made at creation
// is never a link (ADR 0026). Both halves read the same pure function, so the
// numbers the confirmation announced are the ones the write then produces.

/** The fiches of one form, each with what deciding on its rights needs. */
async function formEntries(formId: string) {
  return prisma.page.findMany({ where: { formId }, include: WITH_RIGHTS });
}

/**
 * The defaults as they can actually be written today: a name that has gone
 * since the tab saved it is dropped (ADR 0026). Read once for the whole lot,
 * and by the count as well as by the write — otherwise a row nothing can
 * carry would leave its fiche « à changer » for good, and the write that
 * tried it would break on the foreign key and take the whole action with it.
 *
 * Costs no query in the shape a wiki runs in, where the defaults name nobody.
 */
async function liveDefaults(
  permissions: FormPermissions
): Promise<FormPermissions> {
  const named = defaultsPrincipals(permissions);
  if (named.usernames.length === 0 && named.groupSlugs.length === 0) {
    return permissions;
  }
  return withKnownPrincipals(permissions, await existingPrincipals(named));
}

export async function countEntryRightsImpact(
  formId: string,
  permissions: FormPermissions
): Promise<EntryRightsImpact> {
  return entryRightsImpact(
    await currentPerson(),
    await formEntries(formId),
    await liveDefaults(permissions)
  );
}

/**
 * Rewrites the rights of the form's fiches from its defaults. Only the fiches
 * the person may pose rights on are touched, and only those the defaults would
 * actually move — the two counts the confirmation showed, reached from the
 * other end.
 *
 * The list is rewritten rather than diffed, as the « Accès » modal rewrites
 * one: this is a replacement, and the confirmation says so before the click.
 */
export async function applyFormDefaultsToEntries(
  formId: string,
  permissions: FormPermissions
): Promise<void> {
  const person = await currentPerson();
  // The very defaults the count was taken against, names dropped and all.
  const live = await liveDefaults(permissions);
  const entries = (await formEntries(formId)).filter(
    (entry) => entryRightsVerdict(person, entry, live) === "changed"
  );
  if (entries.length === 0) return;

  const ids = entries.map((entry) => entry.id);
  const rows = entries.flatMap((entry) =>
    entryRightsFrom(live, entry.ownerUsername).acls.map((acl) => ({
      pageId: entry.id,
      ...acl,
    }))
  );
  // The scopes are the same for every fiche — only the floor differs from one
  // to the next — so two statements answer for the lot rather than two each.
  const posed = storedRights(live.defaultEntryRead, live.defaultEntryWrite);
  await prisma.$transaction(
    async (tx) => {
      await tx.pageAcl.deleteMany({ where: { pageId: { in: ids } } });
      await tx.page.updateMany({
        where: { id: { in: ids } },
        data: { readScope: posed.readScope, writeScope: posed.writeScope },
      });
      await tx.pageAcl.createMany({ data: rows });
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

/**
 * An entry's first save (ADR 0014): the page, its snapshot, and the link.
 * Both the right that lets it through and the rights it is born with come
 * from the form, not from the wiki (docs/permissions.md § Formulaire) — that
 * is what lets a wiki which hands out no page still say « chacun propose un
 * événement ».
 *
 * The form's three rules travel in rather than being read here: `Form` is the
 * other door's (ADR 0025), and modules/forms/queries.ts has already read the
 * descriptor they come from on the way to this call.
 */
export async function createEntryPage(input: {
  slug: string;
  formId: string;
  formName: string;
  data: EntryData;
  permissions: FormPermissions;
}): Promise<void> {
  const { slug, formId, formName, data, permissions } = input;
  if (!canCreateEntry(await currentPerson(), permissions)) {
    throw new Error(CREATE_ENTRY_REFUSED);
  }
  // No merge here, where an edit has one: the merge protects the values a
  // revision already holds (docs/permissions.md § Champ), and a fiche being
  // born holds none. Its author owns it, and the fields they may not fill are
  // absent from their screen.
  const author = await currentUsername();
  const born = await bornWith(
    permissions.defaultEntryRead,
    permissions.defaultEntryWrite
  );
  await prisma.$transaction(async (tx) => {
    // Page.tags (ADR 0007) is shared machinery, not the fiche's own `tags`
    // field (docs/forms.md § Mots-clés ≠ tags de Page). The form's name is
    // the one default that makes sense for every fiche, whatever its form.
    const page = await tx.page.create({
      data: { slug, ownerUsername: author, formId, tags: [formName], ...born },
    });
    await mintRevision(tx, {
      pageId: page.id,
      data: data as Prisma.InputJsonValue,
      authorUsername: author,
    });
  });
}

/**
 * A new snapshot for an existing entry, unless the data is unchanged
 * (revisions are the content's history, ADR 0003).
 *
 * A revision stores a **complete** snapshot, so the write merges rather than
 * replaces (docs/permissions.md § Champ): it starts from the current revision
 * and lays over it only the fields this person may write. Done here, at the
 * door, and from the revision the door itself just read — a caller could hand
 * over a merge made against a snapshot that has moved since, and that stale
 * base is exactly the salary somebody wipes by saving the fiche.
 *
 * The descriptor travels in rather than being read here: `Form` is the other
 * door's (ADR 0025), and modules/forms/queries.ts has already read it on the
 * way to this call.
 */
export async function writeEntryRevision(input: {
  pageId: string;
  data: EntryData;
  descriptor: FormDescriptor;
}): Promise<void> {
  const { pageId, data, descriptor } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true, ...WITH_RIGHTS },
  });
  await assertCanWrite(page);
  const person = await currentPerson();
  const current = readEntryData(page.current?.data);
  const merged = mergedEntryData(person, descriptor, current, data);
  // The title is worked out here, from the merge and after it — the same
  // order a restore follows next door, and for the same reason: a gabarit
  // naming a field this person may not write has to go on reading the value
  // the fiche holds, where what arrived from the browser no longer carries
  // it. Stored, never recomputed at read (ADR 0020), so a title worked out
  // from the wrong values would stay wrong for good.
  const title = computeAutomaticTitle(descriptor, merged);
  if (title.trim() === "") throw new Error(emptyTitleMessage(descriptor));
  const withTitle = { ...merged, title };
  // Compared before reordering, against `merged` — which, like `current`,
  // carries only genuinely new keys out of place: storage makes no order
  // promise (jsonb), so reordering first would make every save look changed,
  // the reorder itself masquerading as new content.
  const unchanged = JSON.stringify(current) === JSON.stringify(withTitle);
  const author = await currentUsername();
  if (unchanged) return;
  // Ordered by the form's own fields (docs/permissions.md § /{slug}/raw) —
  // `title` lands wherever the form's own author placed it, never forced to
  // the front — the one reorder that actually reaches storage, done last so
  // nothing above has to reason about anything but values. `withTitle`
  // already exists above for the comparison, so this reuses it directly
  // rather than through withTitleOrdered, which would fold `title` back in
  // a second time for no reason.
  const written = orderedEntryData(descriptor, withTitle);
  // Two writes — the revision and the pointer that names it current — so the
  // transaction stays, though the tags no longer ride along with them.
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      data: written as Prisma.InputJsonValue,
      authorUsername: author,
    });
  });
}
