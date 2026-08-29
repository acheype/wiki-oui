"use server";

// The transport of the single-use link (ADR 0014): what the `invitation` and
// `mot-de-passe-oublie` system pages call. They are MDX pages, so their
// components only meet the query string client-side and read through a Server
// Action like the other built-in system pages. No person to check anywhere
// here — the token is the whole credential
// (modules/accounts/invitation/link-actions.ts).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type AccountLinkTarget,
  acceptInvitation,
  readAccountLink,
  requestPasswordReset,
  resetPasswordWithLink,
} from "@/modules/accounts/invitation/link-actions";
import type { AuthError } from "@/modules/accounts/session/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";
import { identityRefusal } from "@/modules/accounts/session/rules";
import { wikiConfig } from "@/wiki.config";

/**
 * What the `invitation` page draws, decided by the token its URL carries: an
 * invitation asks for a name, an identifier and a password, a reset only for
 * a password, and a spent link for nothing at all. Reading it does not spend
 * it.
 */
export async function readInvitation(
  token: string
): Promise<AccountLinkTarget | null> {
  return readAccountLink(token);
}

/**
 * The end of an invitation: the person names themselves and chooses a
 * password, and the link is spent. Nobody is signed in when this runs.
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
 * with no account makes the wiki prove it could have sent
 * (modules/accounts/invitation/mailer.ts). Only the failure travels back, never its
 * detail: the system page is open to anyone, and the reason names hosts and
 * accounts.
 */
export async function requestPasswordLink(
  email: string
): Promise<{ undelivered: true } | null> {
  return (await requestPasswordReset(email)) ? { undelivered: true } : null;
}
