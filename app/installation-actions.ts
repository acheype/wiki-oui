"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { INSTALLER, MIN_PASSWORD_LENGTH } from "@/lib/installation";
import { assignPagesOwner } from "@/lib/pages";
import { createAdminsGroupWith } from "@/lib/permissions-db";
import { isInstalled, markInstalled } from "@/lib/settings";
import { specialSlugs, wikiConfig } from "@/wiki.config";

export type InstallError = { error: string };

/**
 * The first visit (ADR 0027): create the administrator account, put @Admins
 * around it, hand it the special pages, and only then pose the flag that
 * closes this door for good. Marking last is what makes a failed attempt
 * retryable — and the steps before it converge rather than duplicate.
 *
 * The screen only asks for an email and a password: the display name and the
 * identifier are imposed, so every WikiOui installation looks alike.
 */
export async function installWiki(input: {
  email: string;
  password: string;
}): Promise<InstallError | void> {
  if (await isInstalled()) {
    return { error: "Ce wiki est déjà installé." };
  }

  const email = input.email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Cette adresse e-mail n'est pas valide." };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    };
  }

  try {
    // Signs the installer in on the spot: the session cookie rides back out
    // through the nextCookies plugin.
    await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: INSTALLER.name,
        username: INSTALLER.username,
      },
    });
  } catch {
    return {
      error: "La création du compte a échoué. Réessayez dans un instant.",
    };
  }

  await createAdminsGroupWith(INSTALLER.username);
  // The site's chrome gets someone responsible for it; the example pages keep
  // no owner, so demonstration content has no false one.
  await assignPagesOwner(specialSlugs, INSTALLER.username);
  await markInstalled();

  revalidatePath("/", "layout");
  redirect(`/${wikiConfig.homeSlug}`);
}
