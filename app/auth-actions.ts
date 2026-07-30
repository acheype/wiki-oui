"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signInMethod } from "@/lib/username";
import { wikiConfig } from "@/wiki.config";

export type AuthError = { error: string };

/**
 * Where to land afterwards. Only a path inside this wiki is honoured: the
 * parameter travels in a URL, so anyone can write it, and following it to
 * another host would turn the sign-in screen into an open redirect.
 */
function safeDestination(destination: string | undefined): string {
  if (destination?.startsWith("/") && !destination.startsWith("//")) {
    return destination;
  }
  return `/${wikiConfig.homeSlug}`;
}

/**
 * One field for the email and the identifier alike, so nobody has to guess
 * which one is expected (docs/permissions.md). The @ picks the door; the
 * message on failure names neither, so a wrong password and an unknown
 * account are indistinguishable from outside.
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
  } catch {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  revalidatePath("/", "layout");
  redirect(safeDestination(input.destination));
}

export async function signOut(destination?: string): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  revalidatePath("/", "layout");
  redirect(safeDestination(destination));
}
