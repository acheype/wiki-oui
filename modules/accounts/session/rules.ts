// What the door asks (docs/permissions.md § Comptes): the fields a person
// fills to create an account, and what a refused sign-in is told. Pure and
// client-safe, like modules/permissions/groups-nesting.ts — auth-actions.ts beside it
// carries these verdicts to BetterAuth, and modules/accounts/auth.ts reads the
// refusal straight out of this file.

import { z } from "zod";
import { isValidUsername } from "@/modules/accounts/username";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";

/** How a refusal travels back from a transport to the form that asked. */
export type AuthError = { error: string };

/**
 * The floor BetterAuth enforces, said in the words the person reads. Both a
 * new account and a reset by link land on it, so it is written once here
 * rather than in each transport.
 */
export function passwordRefusal(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`
    : null;
}

/**
 * What both ways of creating an account check before BetterAuth is asked
 * anything: the fields a person fills, in the words they filled them. It lives
 * here rather than in either transport because both reach it — free sign-up
 * from auth-actions.ts beside this file, an accepted invitation from
 * invitation/auth-actions.ts — and a `"use server"` file exports no
 * synchronous function to share.
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
  return passwordRefusal(input.password);
}

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
