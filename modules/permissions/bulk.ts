// What an action by lot would do, worked out before it is done
// (docs/permissions.md § gerer-pages). Pure, like permissions.ts next door:
// the count the modal shows and the rows the access layer then writes are
// the same function, so what was announced is what happens.

import { plural } from "@/lib/format";
import { type MemberRef, refUsername } from "@/modules/permissions/groups";
import {
  type AccessRule,
  type PageRights,
  type PermKind,
  ADMINS_GROUP,
  PERM_KINDS,
  pageRule,
} from "@/modules/permissions/rules";

/**
 * The two intents one modal carries, each with the description it keeps
 * whether it is selected or not: what the other one would do is exactly what
 * one needs to read before choosing. « Donner accès » comes first and
 * preselected — of the two, it is the one that destroys nothing.
 */
export const BULK_INTENTS = [
  {
    value: "grant",
    label: "Donner accès",
    description:
      "Ajoute des personnes et des groupes aux accès existants. Les accès déjà accordés sont conservés.",
  },
  {
    value: "replace",
    label: "Remplacer les accès",
    description:
      "Remplace les accès actuels par ceux définis ici. Les réglages actuels seront perdus.",
  },
] as const;

export type BulkIntent = (typeof BULK_INTENTS)[number]["value"];

/**
 * Who « Donner accès » is about: one person or one group, as the note names
 * them. A person carries the groups nesting puts them in — that is often why
 * they already have access, and a count that ignored it would promise to add
 * a line that grants nothing.
 */
export interface GrantTarget {
  /** « Marie Durand » or « @Bureau », as the note prints it. */
  label: string;
  /** Who the added line names: the account, or the group itself. */
  ref: MemberRef;
  /** The groups that reach them: for a person theirs, for a group those holding it. */
  groupSlugs: readonly string[];
}

/**
 * Whether a rule already lets this target through. Deliberately not
 * ruleAllows: that one answers for a person, who may be a visitor, where a
 * target is an account or a group of accounts — either way, whoever it names
 * is signed in, so « les personnes connectées » covers them.
 */
function ruleReaches(rule: AccessRule, target: GrantTarget): boolean {
  const username = refUsername(target.ref);
  switch (rule.scope) {
    case "everyone":
    case "authenticated":
      return true;
    case "restricted":
      return (
        (username !== null && (rule.usernames ?? []).includes(username)) ||
        (rule.groupSlugs ?? []).some((slug) => target.groupSlugs.includes(slug))
      );
  }
}

/**
 * Whether this page already gives the target what the lot would add — the
 * « rien à changer » half of the count, and the pages the write then skips.
 */
export function alreadyGrants(
  page: PageRights,
  kind: PermKind,
  target: GrantTarget
): boolean {
  // The floor first: the owner and the administrators hold their access
  // whatever the scope says, so a line naming them grants nothing.
  const username = refUsername(target.ref);
  if (username !== null && page.ownerUsername === username) return true;
  if (target.groupSlugs.includes(ADMINS_GROUP.slug)) return true;
  // Writing implies reading, so a page this target may already modify is one
  // they may already see — the rule canRead settles, reached from the other end.
  if (ruleReaches(pageRule(page, "WRITE"), target)) return true;
  return kind === "READ" && ruleReaches(pageRule(page, "READ"), target);
}

/**
 * How a sentence names what is selected: one page is « la page », since its
 * count says nothing anybody cannot see, and a lot is its number. Written once
 * because every system page of the lot says it — the title, the two confirmations
 * and the toasts.
 */
export function lotSubject(total: number): string {
  return total === 1 ? "la page" : plural(total, "page", "pages");
}

/**
 * The lot as a sentence points at it. Written out both ways rather than built
 * from a count: at one page the article changes with the number, and « aux 1
 * page sélectionnée » is what assembling the pieces gives.
 */
export function lotSelected(total: number): string {
  return total === 1
    ? "à la page sélectionnée"
    : `aux ${plural(total, "page sélectionnée", "pages sélectionnées")}`;
}

/** How a lot divides, once the pages that already give access are set aside. */
export interface GrantTally {
  total: number;
  added: number;
  alreadyGranted: number;
}

export function grantTally(
  pages: readonly PageRights[],
  kind: PermKind,
  target: GrantTarget
): GrantTally {
  const alreadyGranted = pages.filter((page) =>
    alreadyGrants(page, kind, target)
  ).length;
  return {
    total: pages.length,
    added: pages.length - alreadyGranted,
    alreadyGranted,
  };
}

/** What the added access is called, in the words the field above it uses. */
const ACCESS_SENSE: Record<PermKind, string> = {
  READ: "lecture",
  WRITE: "écriture",
};

/**
 * The count carries the explanation, and it is what makes the action
 * understandable (docs/permissions.md § gerer-pages): on a page open to
 * everyone or to signed-in people the target already has access, so doing
 * nothing is the right outcome — it only has to be said.
 *
 * Two shapes, because two situations: the sentence counts in what the action
 * changes and sets the rest aside, and when it changes nothing at all it says
 * so outright rather than promising an access that is already held. What is
 * added is an access to pages, never a page to a list — the rows are the
 * wiki's business, and naming them left the reader counting the wrong things.
 */
export function grantNote(
  tally: GrantTally,
  kind: PermKind,
  target: GrantTarget
): { headline: string; lines: string[] } {
  const sense = ACCESS_SENSE[kind];
  if (tally.added === 0) {
    const held =
      tally.total === 1 ? "cette page" : `ces ${lotSubject(tally.total)}`;
    return {
      headline: `${target.label} a déjà accès en ${sense} à ${held} : rien à changer.`,
      lines: [],
    };
  }
  return {
    headline: `${target.label} recevra l'accès en ${sense} à ${plural(
      tally.added,
      "page",
      "pages"
    )}.`,
    lines:
      tally.alreadyGranted === 0
        ? []
        : [
            plural(
              tally.alreadyGranted,
              "page lui donne déjà accès — rien à changer.",
              "pages lui donnent déjà accès — rien à changer."
            ),
          ],
  };
}

/**
 * What « Remplacer les accès » poses. A sense left out is « Ne pas changer »
 * — the default of both, so that touching the reading alone is what happens
 * when reading alone is what one came for. An absence rather than a fourth
 * scope: there is nothing to store for it, and nothing to pose.
 */
export type RightsReplacement = Partial<Record<PermKind, AccessRule>>;

/** Who « Donner accès » names, sense by sense — the whole of one action. */
export type AccessGrant = Partial<Record<PermKind, readonly MemberRef[]>>;

export function nothingToReplace(replacement: RightsReplacement): boolean {
  return PERM_KINDS.every((kind) => replacement[kind] === undefined);
}

/**
 * Whether the whole action would write a single row. Nobody named answers it,
 * but so does naming only people the lot already lets in: the button that
 * would carry out nothing stays out of reach, rather than reporting a success
 * over pages it did not touch. Same reading as the notes above it — what they
 * announce and what the button offers cannot disagree.
 */
export function grantAddsNothing(
  pages: readonly PageRights[],
  named: Partial<Record<PermKind, readonly GrantTarget[]>>
): boolean {
  return PERM_KINDS.every((kind) =>
    (named[kind] ?? []).every(
      (target) => grantTally(pages, kind, target).added === 0
    )
  );
}

/** The sentence a sense gets, whether it is being replaced or left alone. */
const REPLACED_LINE: Record<PermKind, [string, string]> = {
  READ: [
    "Les droits de lecture actuels sont perdus.",
    "La lecture n'est pas touchée.",
  ],
  WRITE: [
    "Les droits de modification actuels sont perdus.",
    "La modification n'est pas touchée.",
  ],
};

/**
 * The other intent's warning: the pages will have exactly what is chosen, and
 * what they carry today is gone. Said sense by sense — half a replacement is
 * the ordinary case, and « la modification n'est pas touchée » is the half
 * nobody would otherwise be sure of.
 */
export function replacementNote(
  total: number,
  replacement: RightsReplacement
): { headline: string; lines: string[] } {
  if (nothingToReplace(replacement)) {
    return { headline: "Choisissez un sens à remplacer.", lines: [] };
  }
  const subject =
    total === 1 ? "La page aura" : `Les ${lotSubject(total)} auront`;
  return {
    headline: `${subject} exactement ces droits.`,
    lines: PERM_KINDS.map(
      (kind) => REPLACED_LINE[kind][replacement[kind] === undefined ? 1 : 0]
    ),
  };
}
