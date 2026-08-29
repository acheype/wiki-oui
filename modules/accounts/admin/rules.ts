// The rules of an account, pure and client-safe like modules/permissions/groups.ts
// beside it: what both ways of creating one check before BetterAuth is asked
// anything, and — the bulk of the file — the two permissions an administrator
// has over an account that exists (docs/permissions.md § Fin d'un compte),
// with what the system page says about them.
// modules/accounts/admin/lifecycle.ts loads what these functions need and
// writes their verdict back.

import { z } from "zod";
import { isValidUsername } from "@/modules/accounts/username";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";
import { plural } from "@/lib/format";
import { REFUSALS } from "@/modules/permissions/rules";

/**
 * What both ways of creating an account check before BetterAuth is asked
 * anything: the fields a person fills, in the words they filled them. It lives
 * here rather than in either transport because both reach it — free sign-up
 * from admin/auth-actions.ts, an accepted invitation from link/auth-actions.ts
 * — and a `"use server"` file exports no synchronous function to share.
 */
export function identityRefusal(input: {
  name: string;
  username: string;
  email?: string;
  password: string;
}): string | null {
  if (input.name.trim() === "") {
    return "Le nom affiché est obligatoire.";
  }
  if (!isValidUsername(input.username)) {
    return `Identifiant invalide : «\u00A0${input.username}\u00A0» (minuscules, chiffres et tirets).`;
  }
  if (input.email !== undefined && !z.email().safeParse(input.email.trim()).success) {
    return "Cette adresse e-mail n'est pas valide.";
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}

/** Why an account action was refused, or null once it went through. */
export type AccountRefusal = string | null;

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

/** The code that carries the refusal out of BetterAuth and into the system page. */
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

/** An administrator's action on one account, as the refusals read it. */
export interface AccountAction {
  username: string;
  /** Who is acting: an administrator, since nobody else reaches this system page. */
  personUsername: string | null;
  /** The target is the last administrator who could still sign in. */
  lastAdmin: boolean;
}

/**
 * Why this account cannot be disabled, or null when it can. Disabling one's
 * own is refused outright: it locks the author of the action out on the
 * spot, and « se déconnecter » is what they were looking for.
 */
export function disableRefusal(action: AccountAction): string | null {
  if (action.username === action.personUsername) {
    return "Vous ne pouvez pas désactiver votre propre compte. Déconnectez-vous plutôt.";
  }
  return lastAdminRefusal(action);
}

/**
 * Why this account cannot be erased, or null when it can. Erasing one's own
 * is a right, not an accident (RGPD, droit à l'effacement) — so nothing
 * stands in its way but the wiki's one invariant: an administrator has to
 * hand the wiki on before they go, since the installation service will not
 * give it back (ADR 0027).
 */
export function deleteRefusal(action: AccountAction): string | null {
  return lastAdminRefusal(action);
}

function lastAdminRefusal(action: AccountAction): string | null {
  return action.lastAdmin ? REFUSALS.lastAdmin : null;
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

/**
 * What an erasure does, in the words owed to whoever asks for their own
 * (RGPD, droit à l'effacement). Two halves that must be said together: the
 * personal data goes, and the contributions stay — a wiki emptied of its
 * pages every time someone leaves would be no wiki, and nothing in what
 * remains carries a name any more.
 */
export const OWN_ERASURE_NOTICE = [
  "Conformément au RGPD, vos données personnelles sont effacées : nom affiché, identifiant, adresse e-mail et mot de passe.",
  "Plus rien ne portera votre nom : les pages, fiches et formulaires dont vous êtes propriétaire ou auteur s'afficheront «\u00A0Anonyme\u00A0», historique compris.",
  "Ces contenus, eux, restent sur le wiki : votre départ ne les emporte pas.",
];

/** And what it does not do, on the system page where someone erases another. */
export const ERASURE_KEEPS_CONTENT =
  "Les pages et l'historique subsistent dans tous les cas : seule la signature change.";

/** Nothing to count is nothing to say: the fragment leaves the sentence. */
function countOf(total: number, one: string, many: string): string | null {
  return total === 0 ? null : plural(total, one, many);
}
