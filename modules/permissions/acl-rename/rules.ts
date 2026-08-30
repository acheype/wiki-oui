import type { FormDescriptor, FormField } from "@/modules/forms/form-descriptor";
import type { AccessRule } from "@/modules/permissions/rules";

// The application sweep ADR 0024 calls for: a username or a group slug reaches
// no foreign key inside `Form.schema` — the field rights (docs/permissions.md
// § Champ) and a form's own defaults (§ Formulaire, ADR 0026) name principals
// in "restricted" AccessRules there, and nothing but a sweep keeps a renamed
// or erased account or group from leaving a right inert or, worse,
// resurrected for a namesake. Same pairing as slug-rename and field-rename:
// this module is pure, acl-rename-db.ts finds the candidate forms and writes.

export type PrincipalKind = "username" | "groupSlug";

/**
 * One change to apply everywhere a principal is named: a rename when `to`
 * holds the new name, an erasure when it is null — the two triggers ADR 0024
 * asks this sweep to run on.
 */
export interface PrincipalChange {
  kind: PrincipalKind;
  from: string;
  to: string | null;
}

const LIST_KEY_OF_KIND = { username: "usernames", groupSlug: "groupSlugs" } as const;

/**
 * One rule with the change applied, or null when it does not name this
 * principal — which every rule outside « seulement » answers at once, since
 * only a restricted scope ever holds a list.
 */
export function rewriteAccessRule(
  rule: AccessRule,
  change: PrincipalChange
): AccessRule | null {
  if (rule.scope !== "restricted") return null;
  const key = LIST_KEY_OF_KIND[change.kind];
  const list = rule[key] ?? [];
  if (!list.includes(change.from)) return null;
  const rest = list.filter((name) => name !== change.from);
  return {
    ...rule,
    [key]: change.to === null ? rest : [...new Set([...rest, change.to])],
  };
}

/** A form's fields with the change applied to their read and write rights. */
export function rewriteFieldRights(
  fields: readonly FormField[],
  change: PrincipalChange
): FormField[] | null {
  let touched = false;
  const rewritten = fields.map((field) => {
    const readAcl = field.readAcl && rewriteAccessRule(field.readAcl, change);
    const writeAcl = field.writeAcl && rewriteAccessRule(field.writeAcl, change);
    if (!readAcl && !writeAcl) return field;
    touched = true;
    return {
      ...field,
      ...(readAcl && { readAcl }),
      ...(writeAcl && { writeAcl }),
    };
  });
  return touched ? rewritten : null;
}

type FormPermissions = NonNullable<FormDescriptor["permissions"]>;

/**
 * A form's own defaults (« Accès » tab) with the change applied, or null when
 * none of the three rules names this principal.
 */
export function rewriteFormPermissions(
  permissions: FormPermissions,
  change: PrincipalChange
): FormPermissions | null {
  const createEntry = rewriteAccessRule(permissions.createEntry, change);
  const defaultEntryRead = rewriteAccessRule(permissions.defaultEntryRead, change);
  const defaultEntryWrite = rewriteAccessRule(permissions.defaultEntryWrite, change);
  if (!createEntry && !defaultEntryRead && !defaultEntryWrite) return null;
  return {
    createEntry: createEntry ?? permissions.createEntry,
    defaultEntryRead: defaultEntryRead ?? permissions.defaultEntryRead,
    defaultEntryWrite: defaultEntryWrite ?? permissions.defaultEntryWrite,
  };
}

/**
 * A whole descriptor with the change applied everywhere it poses a right —
 * every field and the form's own defaults — or null when the principal is
 * named nowhere in it, the "writes nothing" half of ADR 0024.
 */
export function rewriteDescriptorRights(
  descriptor: FormDescriptor,
  change: PrincipalChange
): FormDescriptor | null {
  const fields = rewriteFieldRights(descriptor.fields, change);
  const permissions = descriptor.permissions
    ? rewriteFormPermissions(descriptor.permissions, change)
    : null;
  if (!fields && !permissions) return null;
  return {
    ...descriptor,
    ...(fields && { fields }),
    ...(permissions && { permissions }),
  };
}
