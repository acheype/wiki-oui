"use server";

// The transport of authentication (ADR 0023): the three Server Actions a
// person calls to open, open again or close their own session. The public
// half of the same subject is modules/accounts/auth.ts, the BetterAuth
// configuration these three call.
//
// Nothing is decided here: BetterAuth answers for the password, and rules.ts
// beside this file for the identity a sign-up proposes. What is left is the
// round trip and where it lands.

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  type AuthError,
  identityRefusal,
} from "@/modules/accounts/auth/rules";
import {
  clearAccountLink,
  signUpRefusal,
} from "@/modules/accounts/invitation/link";
import { auth } from "@/modules/accounts/auth";
import { destinationWithinWiki } from "@/lib/destination";
import { signInMethod } from "@/modules/accounts/username";
import { wikiConfig } from "@/wiki.config";

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
