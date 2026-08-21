// What a form decides about its fiches (docs/permissions.md § Formulaire :
// trois réglages, pas deux). Pure, like permissions.ts and bulk-rights.ts
// next door: the tab poses these rules, the door reads them back, and the
// count a confirmation announces is worked out by the very function that
// decides what the write then changes — so what was announced is what happens.

import { plural } from "@/lib/format";
import type { FormDescriptor } from "@/modules/forms/form-descriptor";
import {
  type AccessRule,
  type AclEntry,
  type Person,
  type PageRights,
  type StoredRights,
  coveredPrincipals,
  isAdmin,
  ownsPage,
  ruleAllows,
  storedRights,
  withoutCovered,
} from "@/modules/permissions/rules";
import { wikiConfig } from "@/wiki.config";

/**
 * The three settings a form poses. Creating a fiche and modifying one already
 * there are two distinct rights, never one: confusing them would break the
 * commonest shape of an association's wiki — « chacun propose un événement,
 * chacun ne modifie que le sien ».
 */
export interface FormPermissions {
  /** Who may add a fiche at all. */
  createEntry: AccessRule;
  /** What a fiche is born able to be seen by — copied, never linked. */
  defaultEntryRead: AccessRule;
  /** And to be modified by. */
  defaultEntryWrite: AccessRule;
}

/**
 * The three rules a new form is born with: the wiki's own, copied (ADR 0026).
 * The same action one storey down — the form copies from the configuration,
 * the fiche copies from the form — and neither copy is ever a link.
 */
export function bornFormPermissions(): FormPermissions {
  const { createPage, defaultPageRead, defaultPageWrite } =
    wikiConfig.permissions;
  return {
    createEntry: createPage,
    defaultEntryRead: defaultPageRead,
    defaultEntryWrite: defaultPageWrite,
  };
}

/**
 * What a form poses today. A descriptor written before the tab existed
 * carries nothing, and the wiki's defaults answer for it — exactly what would
 * have been copied at its creation. Anything the tab has saved wins outright:
 * that is what « recopiés, jamais liés » means once the copy is in base.
 */
export function formPermissions(descriptor: FormDescriptor): FormPermissions {
  return descriptor.permissions ?? bornFormPermissions();
}

/** Whether this person may add a fiche to the form. */
export function canCreateEntry(
  person: Person,
  permissions: FormPermissions
): boolean {
  return isAdmin(person) || ruleAllows(person, permissions.createEntry);
}

// --- applying the defaults to the fiches already there -----------------------

// The only path from a default to what already exists (ADR 0026): an explicit
// button, behind a confirmation that says the numbers — the motif of the mass
// recomputes of ADR 0017 and 0020.

/**
 * The rights the defaults would pose on one fiche, its own floor applied. A
 * row naming the fiche's owner would grant nothing, the owner holding their
 * access whatever the scope says, so it is dropped here — at the same point
 * setPageRights drops it when a right is posed by hand.
 */
export function entryRightsFrom(
  permissions: FormPermissions,
  ownerUsername: string | null
): StoredRights {
  const posed = storedRights(
    permissions.defaultEntryRead,
    permissions.defaultEntryWrite
  );
  return {
    ...posed,
    acls: withoutCovered(posed.acls, coveredPrincipals(ownerUsername)),
  };
}

/**
 * The two defaults with the names that no longer exist dropped (ADR 0026): a
 * default naming an account or a group that has since gone must not grant
 * anything on the quiet. The caller passes what still exists, since only the
 * database knows — the same bargain knownEntries strikes for a page's rows.
 *
 * Applied before the count as well as before the write, or the two would part
 * company: a row nothing can carry would leave its fiche « à changer » for
 * good, and the write that tried would break on the foreign key.
 */
export function withKnownPrincipals(
  permissions: FormPermissions,
  known: { usernames: ReadonlySet<string>; groupSlugs: ReadonlySet<string> }
): FormPermissions {
  const keep = (rule: AccessRule): AccessRule => ({
    scope: rule.scope,
    usernames: (rule.usernames ?? []).filter((name) => known.usernames.has(name)),
    groupSlugs: (rule.groupSlugs ?? []).filter((slug) => known.groupSlugs.has(slug)),
  });
  return {
    createEntry: permissions.createEntry,
    defaultEntryRead: keep(permissions.defaultEntryRead),
    defaultEntryWrite: keep(permissions.defaultEntryWrite),
  };
}

/** Who the two defaults name, for the caller that asks the database. */
export function defaultsPrincipals(permissions: FormPermissions): {
  usernames: string[];
  groupSlugs: string[];
} {
  const rules = [permissions.defaultEntryRead, permissions.defaultEntryWrite];
  return {
    usernames: rules.flatMap((rule) => [...(rule.usernames ?? [])]),
    groupSlugs: rules.flatMap((rule) => [...(rule.groupSlugs ?? [])]),
  };
}

/** One row of a « seulement » list, as a comparison can hold it. */
function aclKey(acl: AclEntry): string {
  return `${acl.kind}:${acl.username ?? ""}:${acl.groupSlug ?? ""}`;
}

/** Whether a fiche already holds exactly these rights — nothing to write. */
export function holdsRights(page: PageRights, rights: StoredRights): boolean {
  if (page.readScope !== rights.readScope) return false;
  if (page.writeScope !== rights.writeScope) return false;
  if (page.acls.length !== rights.acls.length) return false;
  const held = new Set(page.acls.map(aclKey));
  return rights.acls.every((acl) => held.has(aclKey(acl)));
}

/** How the fiches of a form divide, faced with its defaults as they stand. */
export interface EntryRightsImpact {
  total: number;
  /** Fiches the defaults would actually move. */
  changed: number;
  /** Fiches already holding exactly these rights. */
  unchanged: number;
  /**
   * Fiches the person does not look after, which the action leaves alone —
   * somebody else's, and the ownerless ones too, which are the
   * administrators' alone. Posing rights stops at the owner or an
   * administrator (docs/permissions.md § Quel droit commande quelle action), and
   * that rung holds here too: a form's owner opening the form must not
   * thereby shut a contributor out of their own fiche. Unlike the lot of
   * `gerer-pages` — where the administrator ticked each line — nobody chose
   * these fiches one by one, so the refusal is counted and said rather than
   * turning down the whole action.
   */
  refused: number;
}

/**
 * Where one fiche falls. Named rather than spelled out twice: the count the
 * confirmation shows and the rows the door then writes are the same verdict,
 * and two spellings of it would agree only by coincidence — the day one moved,
 * the wiki would announce a number and write another.
 */
export function entryRightsVerdict(
  person: Person,
  entry: PageRights,
  permissions: FormPermissions
): "changed" | "unchanged" | "refused" {
  if (!ownsPage(person, entry)) return "refused";
  return holdsRights(entry, entryRightsFrom(permissions, entry.ownerUsername))
    ? "unchanged"
    : "changed";
}

export function entryRightsImpact(
  person: Person,
  entries: readonly PageRights[],
  permissions: FormPermissions
): EntryRightsImpact {
  const impact = { total: entries.length, changed: 0, unchanged: 0, refused: 0 };
  for (const entry of entries) {
    impact[entryRightsVerdict(person, entry, permissions)] += 1;
  }
  return impact;
}

/**
 * Whether the whole action would write anything at all. The button reads the
 * same count the confirmation shows — it stays out of reach rather than
 * reporting a success over fiches it did not touch, the rule `gerer-pages`
 * already applies to « Appliquer ».
 */
export function appliesNothing(impact: EntryRightsImpact): boolean {
  return impact.changed === 0;
}

/**
 * What the confirmation announces. Two shapes, because two situations: the
 * sentence counts in what the action changes and sets the rest aside, and
 * when it changes nothing at all it says so outright rather than promising a
 * rewrite that would not happen.
 */
export function entryRightsNote(impact: EntryRightsImpact): {
  headline: string;
  lines: string[];
} {
  if (impact.total === 0) {
    return { headline: "Ce formulaire n'a encore aucune fiche.", lines: [] };
  }
  const lines: string[] = [];
  if (impact.unchanged > 0) {
    lines.push(
      plural(
        impact.unchanged,
        "fiche a déjà ces accès — rien à changer.",
        "fiches ont déjà ces accès — rien à changer."
      )
    );
  }
  if (impact.refused > 0) {
    // Two things this line has to get right. « Ne vous appartiennent pas »
    // rather than « appartiennent à quelqu'un d'autre »: a fiche with no owner
    // belongs to nobody, and naming a holder would invent one. And the rule is
    // spelled out rather than the effect alone — the reader can do nothing
    // about this themselves, so the sentence that helps is the one naming who
    // can.
    lines.push(
      plural(
        impact.refused,
        "fiche ne vous appartient pas : seul son propriétaire ou un administrateur peut changer son accès.",
        "fiches ne vous appartiennent pas : seul leur propriétaire ou un administrateur peut changer leur accès."
      )
    );
  }
  if (impact.changed === 0) {
    return { headline: "Aucune fiche ne change d'accès.", lines };
  }
  // « Les leurs seront perdus » left the reader to work out whose, and what:
  // naming the thing that goes — leurs réglages actuels — and the verb that
  // happens to it says the replacement outright, which is what the action does.
  const replaced =
    impact.changed === 1
      ? "Ses réglages actuels seront remplacés."
      : "Leurs réglages actuels seront remplacés.";
  return {
    headline: `${plural(
      impact.changed,
      "fiche recevra",
      "fiches recevront"
    )} ces accès. ${replaced}`,
    lines,
  };
}
