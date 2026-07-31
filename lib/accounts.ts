// The end of an account (docs/permissions.md § Fin d'un compte): the two
// gestures an administrator has, and what the screen says about them. Pure
// and client-safe, like lib/groups.ts beside it — lib/accounts-db.ts loads
// what these functions need and writes their verdict back.

import { LAST_ADMIN_REFUSAL } from "./permissions";

/**
 * What a line of the accounts list is: someone who can sign in, someone whose
 * access was cut, or an address that has only been invited so far. A state to
 * be observed, never one to be set — disabling is what makes the second, and
 * accepting an invitation is what ends the third.
 */
export type AccountStatus = "active" | "disabled" | "invited";

export type AccountFilter = "all" | AccountStatus;

/**
 * What a disabled account is told when it tries to sign in. Said plainly, and
 * only ever after the right password: reaching this point proves the person
 * is the account's owner, so naming their state tells an attacker nothing
 * they could not already see.
 */
export const ACCOUNT_DISABLED_MESSAGE =
  "Ce compte est désactivé. Contactez un administrateur.";

/** The code that carries the refusal out of BetterAuth and into the screen. */
export const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED";

/** The radio row above the list, in the order the spec draws it. */
export const ACCOUNT_FILTERS: { value: AccountFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "active", label: "Actifs" },
  { value: "disabled", label: "Désactivés" },
  { value: "invited", label: "Invitations en attente" },
];

export function matchesAccountFilter(
  status: AccountStatus,
  filter: AccountFilter
): boolean {
  return filter === "all" || filter === status;
}

/** An administrator's gesture on one account, as the refusals read it. */
export interface AccountGesture {
  username: string;
  /** Who is acting: an administrator, since nobody else reaches this screen. */
  actorUsername: string | null;
  /** The target is the last administrator who could still sign in. */
  lastAdmin: boolean;
}

/**
 * Why this account cannot be disabled, or null when it can. Both refusals
 * guard the same thing — a wiki nobody can administer any more — and the
 * installation screen will not hand it back (ADR 0027): it is a one-way door.
 */
export function disableRefusal(gesture: AccountGesture): string | null {
  return closureRefusal(gesture, "désactiver");
}

export function deleteRefusal(gesture: AccountGesture): string | null {
  return closureRefusal(gesture, "supprimer");
}

/** The verb is all that differs: the two gestures close the same doors. */
function closureRefusal(gesture: AccountGesture, verb: string): string | null {
  if (gesture.username === gesture.actorUsername) {
    return `Vous ne pouvez pas ${verb} votre propre compte.`;
  }
  return gesture.lastAdmin ? LAST_ADMIN_REFUSAL : null;
}

/** What an erasure would leave behind, counted before it is decided. */
export interface DeletionImpact {
  /** Pages and entries alike: an entry is a page (ADR 0014). */
  pages: number;
  forms: number;
  revisions: number;
}

/**
 * The numbers the deletion modal announces (docs/permissions.md). Nothing is
 * destroyed by the deletion itself — pages and history stay, signed
 * « Anonyme » — so these read as what is about to lose its owner, which is
 * exactly what the reassignment offered beside them answers.
 */
export function deletionImpactLines(impact: DeletionImpact): string[] {
  const owned = [
    countOf(impact.pages, "page", "pages"),
    countOf(impact.forms, "formulaire", "formulaires"),
  ].filter((part) => part !== null);

  const lines: string[] = [];
  if (owned.length > 0) {
    const belongs =
      impact.pages + impact.forms > 1 ? "lui appartiennent" : "lui appartient";
    lines.push(`${owned.join(" et ")} ${belongs}.`);
  }
  if (impact.revisions > 0) {
    const signs = impact.revisions > 1 ? "portent" : "porte";
    lines.push(
      `${countOf(impact.revisions, "révision", "révisions")} ${signs} sa signature.`
    );
  }
  if (lines.length === 0) {
    lines.push("Ce compte ne possède aucune page et ne signe aucune révision.");
  }
  return lines;
}

function countOf(total: number, one: string, many: string): string | null {
  if (total === 0) return null;
  return `${total} ${total > 1 ? many : one}`;
}
