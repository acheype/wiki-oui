import type { Form } from "@/lib/generated/prisma/client";
import { canCreateEntry } from "@/modules/permissions/form-level";
import { refuse } from "@/modules/permissions/rules";
import { currentOwns, currentPerson } from "@/modules/permissions/person";
import { type SeenForm, permissionsOf } from "@/modules/forms/forms";
import { readableForm } from "@/modules/permissions/readable-form";
import { currentReadableWhere } from "@/modules/pages/rights";
import { prisma } from "@/lib/prisma";

// The guards of `Form` (ADR 0025), alongside modules/pages/access/guards.ts
// for `Page`. An ESLint rule refuses `prisma.form` anywhere else, so the
// permission checks this layer hosts cannot be bypassed by a caller that
// forgot them — the risk being a silent read, which no test would ever catch.
//
// Private to this module (ADR 0029, wikioui/module-seam): every other file of
// modules/forms/ may import from here, nothing outside the module may. The
// public API — every exported function, plus the constants any other module
// needs — lives in modules/forms/forms.ts instead, a root file, precisely
// because it crosses that seam.
//
// Each gate below reads and decides in one call (ADR 0025, amendment of
// 2026-08-24), and each answers one rung of docs/permissions.md § Droits au
// niveau du formulaire. A read that answers no rung — a name, a count — is
// here too, and stays here: exported from a root file it would be an oversight
// waiting, since nothing about the call site would say which right it skipped.

/** What deciding on a form's definition needs, and nothing more. */
export type OwnedForm = { ownerUsername: string | null };

/**
 * The rung the permissions on a form's definition stop at: its owner, or an
 * administrator (docs/permissions.md § Droits au niveau du formulaire). The
 * same rule as on a page, posed on the other subject — editing a form reaches
 * every fiche ever written with it, so it never opens with the writing.
 */
export async function assertFormStructuring(form: OwnedForm): Promise<void> {
  if (await currentOwns(form.ownerUsername)) return;
  refuse("editForm");
}

/**
 * The same rung, from the technical identifier a write holds. Reads and
 * refuses in one call rather than handing the owner back for the caller to
 * assert on: the two halves only ever appeared together, and the read half
 * alone said nothing about what it was for.
 */
export async function assertFormStructuringOf(formId: string): Promise<void> {
  const form = await prisma.form.findUniqueOrThrow({
    where: { id: formId },
    select: { ownerUsername: true },
  });
  await assertFormStructuring(form);
}

// --- the gates ---------------------------------------------------------------

/**
 * « Cet identifiant est-il déjà pris ? » — a boolean and nothing else, so
 * there is no right to pose on the answer. A form one may not edit still
 * holds its identifier, and answering « libre » would let a save collide.
 */
export async function formSlugExists(slug: string): Promise<boolean> {
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { id: true },
  });
  return form !== null;
}

/**
 * The form a structuring action is about to act on — deleting it, renaming its
 * identifier, counting what either would touch. Read and refused in one call,
 * so that reaching the write means the rung was checked, rather than leaving
 * each action to remember an assertion after its own query. Null when no form
 * answers to the slug, which is the caller's own « ce formulaire n'existe
 * pas » and not a refusal.
 */
export async function structuredForm(
  slug: string
): Promise<{ id: string; name: string } | null> {
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { id: true, name: true, ownerUsername: true },
  });
  if (!form) return null;
  await assertFormStructuring(form);
  return { id: form.id, name: form.name };
}

// Cascade (ADR 0014): deleting a form deletes its entry pages. Takes the slug
// the view holds and reads the form itself rather than being handed one — the
// same shape deletePageBySlug has on the other side. False when no form
// answers to the slug: the caller's own « ce formulaire n'existe pas ».
export async function deleteFormBySlug(slug: string): Promise<boolean> {
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { id: true, ownerUsername: true },
  });
  if (!form) return false;
  await assertFormStructuring(form);
  await prisma.form.delete({ where: { id: form.id } });
  return true;
}

/**
 * The form the builder is about to show and overwrite — the whole definition,
 * schema and template, refused to anyone but its owner and the administrators.
 *
 * Refused, not merely reported. The read this replaces handed the definition
 * back with a `canEdit: false` beside it, which is a right announced rather
 * than applied: a direct call to the Server Action returned every field of a
 * form one does not own, restricted ones named among them.
 *
 * Null when no form answers to the slug, which is the caller's own « ce
 * formulaire n'existe plus » and not a refusal.
 */
export async function editableForm(slug: string): Promise<Form | null> {
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form) return null;
  await assertFormStructuring(form);
  return form;
}

/**
 * The same rung as a boolean, for a caller that leaves a widget out rather
 * than refusing it — « une offre que personne ne peut prendre n'informe
 * personne » (docs/permissions.md § Ce que voit qui n'a pas le droit). False
 * for a form that does not exist, which offers nothing either.
 */
export async function canEditForm(slug: string): Promise<boolean> {
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { ownerUsername: true },
  });
  return form !== null && (await currentOwns(form.ownerUsername));
}

// --- the reads that answer no rung, and stay here for that reason ------------

/**
 * Whether this person may add a fiche to that form — the form's own rule, not
 * the wiki's (docs/permissions.md § Formulaire). A boolean, so a system page
 * leaves « Nouvelle fiche » out rather than offering what it would refuse.
 */
export async function canCreateEntryIn(slug: string): Promise<boolean> {
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { schema: true },
  });
  return form !== null && canCreateEntry(await currentPerson(), permissionsOf(form));
}

/**
 * Every form with the count of its entries, for the forms system page. The
 * count is filtered like the list it heads: a form announcing 40 entries and
 * then showing 12 would be a leak dressed as a bug. The definitions come back
 * whole, which is why this read stays private — what the page shows of them
 * is a name and a number.
 */
export async function listFormsWithEntryCount() {
  const readable = await currentReadableWhere();
  return prisma.form.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: { where: readable } } } },
  });
}

/** slug + name of every form, for the pickers that name forms — nothing else. */
export async function listFormNames() {
  return prisma.form.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}

/**
 * The chosen forms, each already cut to what this person may see — the same
 * gate readableFormBySlug is, over a handful of identifiers at once.
 */
export async function readableFormsBySlugs(slugs: string[]): Promise<SeenForm[]> {
  const forms = await prisma.form.findMany({ where: { slug: { in: slugs } } });
  return Promise.all(
    forms.map(async (form) => ({ ...form, seen: await readableForm(form.schema) }))
  );
}
