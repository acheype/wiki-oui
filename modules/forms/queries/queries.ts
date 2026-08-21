import { FORM_EDIT_REFUSED, ownsSubject } from "@/modules/permissions/rules";
import { currentPerson } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// The only door to `Form` (ADR 0025), alongside modules/pages/queries/queries.ts
// for `Page`. An ESLint rule refuses `prisma.form` anywhere else, so the
// permission checks this layer hosts cannot be bypassed by a caller that
// forgot them — the risk being a silent read, which no test would ever catch.
//
// Private to this module (ADR 0029, wikioui/module-seam): every other file of
// modules/forms/ may import from here, nothing outside the module may. The
// public API — every exported function, plus the constants any other module
// needs — lives in modules/forms/forms.ts instead, a root file, precisely
// because it crosses that seam.

/** What deciding on a form's definition needs, and nothing more. */
export type OwnedForm = { ownerUsername: string | null };

/**
 * The rung the permissions on a form's definition stop at: its owner, or an
 * administrator (docs/permissions.md § Droits au niveau du formulaire). The
 * same rule as on a page, posed on the other subject — editing a form reaches
 * every fiche ever written with it, so it never opens with the writing.
 */
export async function assertFormStructuring(form: OwnedForm): Promise<void> {
  if (ownsSubject(await currentPerson(), form.ownerUsername)) return;
  throw new Error(FORM_EDIT_REFUSED);
}

/** The same read, from the identifier a screen holds. */
export async function ownerOf(formId: string): Promise<OwnedForm> {
  return prisma.form.findUniqueOrThrow({
    where: { id: formId },
    select: { ownerUsername: true },
  });
}
