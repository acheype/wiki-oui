"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE } from "@/modules/accounts/rules";
import {
  type AccountLinkTarget,
  acceptInvitation,
  clearAccountLink,
  readAccountLink,
  requestPasswordReset,
  resetPasswordWithLink,
  signUpRefusal,
} from "@/modules/accounts/access/guards";
import { auth } from "@/modules/accounts/auth";
import { destinationWithinWiki } from "@/lib/destination";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";
import { isValidUsername, signInMethod } from "@/modules/accounts/username";
import { wikiConfig } from "@/wiki.config";

export type AuthError = { error: string };

/** Where to land afterwards, home when nothing usable was carried. */
function landing(destination: string | undefined): string {
  return destinationWithinWiki(destination, `/${wikiConfig.homeSlug}`);
}

/**
 * One field for the email and the identifier alike, so nobody has to guess
 * which one is expected (docs/permissions.md). The @ picks the door; the
 * message on failure names neither, so a wrong password and an unknown
 * account are indistinguishable from outside — except for a disabled account,
 * which is only ever told so once the password proved who is asking.
 */
export async function signIn(input: {
  identifier: string;
  password: string;
  destination?: string;
}): Promise<AuthError | void> {
  const identifier = input.identifier.trim();
  if (identifier === "" || input.password === "") {
    return { error: "Renseignez votre identifiant et votre mot de passe." };
  }

  try {
    if (signInMethod(identifier) === "email") {
      await auth.api.signInEmail({
        body: { email: identifier, password: input.password },
      });
    } else {
      await auth.api.signInUsername({
        body: { username: identifier, password: input.password },
      });
    }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === ACCOUNT_DISABLED_CODE) {
      return { error: ACCOUNT_DISABLED_MESSAGE };
    }
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  revalidatePath("/", "layout");
  redirect(landing(input.destination));
}

export async function signOut(destination?: string): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  revalidatePath("/", "layout");
  redirect(landing(destination));
}

/**
 * Free sign-up, when the wiki opens it (docs/permissions.md § Naissance d'un
 * compte). The same identity rules as an invitation — a display name, an
 * identifier derived from it and personalisable, then frozen — so the two
 * ways in produce accounts nothing tells apart afterwards.
 */
export async function signUp(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  destination?: string;
}): Promise<AuthError | void> {
  if (!wikiConfig.openSignUp) {
    return { error: "L'inscription libre est fermée sur ce wiki." };
  }
  const refusal = identityRefusal(input);
  if (refusal) return { error: refusal };

  const email = input.email.trim().toLowerCase();
  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: input.name.trim(),
        username: input.username,
      },
    });
  } catch (error) {
    return { error: signUpRefusal(error) };
  }

  // An address that was invited and signed up on its own spends its link all
  // the same: left standing, it would read as a password reset for the
  // account just created, and hand it to whoever still held the old mail.
  await clearAccountLink(email);

  revalidatePath("/", "layout");
  redirect(landing(input.destination));
}

/**
 * What both ways of creating an account check before BetterAuth is asked
 * anything: the fields a person fills, in the words they filled them.
 */
function identityRefusal(input: {
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

/**
 * What the `invitation` page draws, decided by the token its URL carries: an
 * invitation asks for a name, an identifier and a password, a reset only for
 * a password, and a spent link for nothing at all. A read through a Server
 * Action like the other built-in system pages (ADR 0014) — the page is MDX, so its
 * component only meets the query string client-side. No person to check: the
 * token is the whole credential, and reading it does not spend it.
 */
export async function readInvitation(
  token: string
): Promise<AccountLinkTarget | null> {
  return readAccountLink(token);
}

/**
 * The end of an invitation: the person names themselves and chooses a
 * password, and the link is spent. Nobody is signed in when this runs — the
 * token is the whole credential (modules/accounts/access/guards.ts).
 */
export async function acceptInvitationLink(input: {
  token: string;
  name: string;
  username: string;
  password: string;
}): Promise<AuthError | void> {
  const refusal = identityRefusal(input);
  if (refusal) return { error: refusal };

  const failure = await acceptInvitation(input);
  if (failure) return { error: failure };

  revalidatePath("/", "layout");
  redirect(`/${wikiConfig.homeSlug}`);
}

/** The same link on an address that already has an account: a new password. */
export async function resetPasswordLink(input: {
  token: string;
  password: string;
}): Promise<AuthError | void> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    };
  }
  const failure = await resetPasswordWithLink(input);
  if (failure) return { error: failure };

  revalidatePath("/", "layout");
  redirect(`/${wikiConfig.homeSlug}`);
}

/**
 * « Mot de passe oublié ». The answer never varies about the address: whether
 * it is known is not this system page's to reveal, and an administrator remains
 * the way through for a wiki with no SMTP. What it does report is whether a
 * mail could leave at all — the same verdict for every address, since one
 * with no account makes the wiki prove it could have sent (modules/accounts/mailer.ts).
 * Only the failure travels back, never its detail: the system page is open to
 * anyone, and the reason names hosts and accounts.
 */
export async function requestPasswordLink(
  email: string
): Promise<{ undelivered: true } | null> {
  return (await requestPasswordReset(email)) ? { undelivered: true } : null;
}
