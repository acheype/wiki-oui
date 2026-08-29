import { APIError } from "better-auth/api";
import type { AccountRefusal } from "@/modules/accounts/admin/rules";
import { auth } from "@/modules/accounts/auth";
import {
  type LinkPurpose,
  type MailFailure,
  RESET_LIFETIME_DAYS,
} from "@/modules/accounts/invitation/rules";
import { fingerprint, mintLink } from "@/modules/accounts/invitation/account-link";
import { probeMailer, sendAccountLink } from "@/modules/accounts/invitation/mailer";
import { joinGroupOnInvitation } from "@/modules/permissions/groups-onboarding";
import type { NamedGroup } from "@/modules/permissions/groups-directory";
import { prisma } from "@/lib/prisma";

// What a stranger holding a link may do (docs/permissions.md § Comptes).
// None of these is a guard: there is no person to check, the token is the
// whole credential, and what it authorizes is exactly the one address the
// link was minted on. `requestPasswordReset` has not even that — anyone may
// ask, and the answer says nothing about the address.
//
// An administrator never sets a password. What they hand over is a link, and
// the two ways through one end here.

/**
 * Expired, already used, or never issued: one answer for the three. Telling
 * them apart would only teach whoever is holding a link they should not have,
 * and the way forward is the same in every case.
 */
const SPENT_LINK = "Ce lien n'est plus valable. Demandez-en un nouveau.";

/** What the link's system page must know to draw itself. */
export interface AccountLinkTarget {
  email: string;
  /** An invitation creates the account; a reset only changes its password. */
  purpose: LinkPurpose;
  /** The group the invitation adds to, named for the system page to announce it. */
  group: NamedGroup | null;
  /** The account the reset is for, so the system page can greet it by name. */
  name: string | null;
}

/**
 * Reads a link without spending it: whoever holds it is a stranger to the
 * wiki, so there is no person to check — the token is the whole credential,
 * and an expired or unknown one is simply nothing.
 */
export async function readAccountLink(
  token: string
): Promise<AccountLinkTarget | null> {
  const link = await prisma.accountLink.findUnique({
    where: { tokenHash: fingerprint(token) },
    include: { group: true },
  });
  if (!link || link.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { email: link.email },
    select: { name: true, disabledAt: true },
  });
  // A disabled account is not reopened by a link that predates the decision.
  if (user?.disabledAt) return null;

  return {
    email: link.email,
    purpose: user ? "reset" : "invitation",
    group: link.group && { slug: link.group.slug, name: link.group.name },
    name: user?.name ?? null,
  };
}

/**
 * The end of an invitation: the person chooses their display name, their
 * identifier and their password, and lands signed in. Single use — the row
 * goes right after the account is created, and its disappearance is what
 * closes the link.
 *
 * No person: the token is the credential. What it authorizes is exactly one
 * account, on exactly the address the invitation named.
 */
export async function acceptInvitation(input: {
  token: string;
  name: string;
  username: string;
  password: string;
}): Promise<AccountRefusal> {
  const target = await readAccountLink(input.token);
  if (!target || target.purpose !== "invitation") {
    return SPENT_LINK;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: target.email,
        password: input.password,
        name: input.name,
        username: input.username,
      },
    });
  } catch (error) {
    return signUpRefusal(error);
  }

  await prisma.accountLink.deleteMany({ where: { email: target.email } });
  if (target.group) {
    await joinGroupOnInvitation(target.group.slug, input.username);
  }
  return null;
}

/**
 * A collision on the identifier asks for another one, never appends a suffix
 * (docs/permissions.md § Identité) — the identifier is public and permanent,
 * so `marie-durand-2` would be a name nobody chose.
 */
export function signUpRefusal(error: unknown): string {
  if (error instanceof APIError) {
    const code = String(error.body?.code ?? "");
    if (code === "USERNAME_IS_ALREADY_TAKEN") {
      return "Cet identifiant est déjà pris. Personnalisez-le.";
    }
    if (code.includes("EMAIL")) {
      return "Cette adresse a déjà un compte. Connectez-vous.";
    }
  }
  return "La création du compte a échoué. Réessayez dans un instant.";
}

/**
 * The other end of the same primitive: an account that exists gets a new
 * password. The other sessions go with it — whoever needed this link may be
 * recovering an account someone else had a hand on — and the person is signed
 * in on this one, so both ways through a link end at the same place.
 */
export async function resetPasswordWithLink(input: {
  token: string;
  password: string;
}): Promise<AccountRefusal> {
  const target = await readAccountLink(input.token);
  if (!target || target.purpose !== "reset") {
    return SPENT_LINK;
  }

  const user = await prisma.user.findUnique({
    where: { email: target.email },
    select: { id: true },
  });
  if (!user) return SPENT_LINK;

  // BetterAuth owns passwords and their hashing (ADR 0023); what the wiki
  // owns is the link that says this person may set one.
  const context = await auth.$context;
  if (input.password.length < context.password.config.minPasswordLength) {
    return `Le mot de passe doit faire au moins ${context.password.config.minPasswordLength} caractères.`;
  }
  await context.internalAdapter.updatePassword(
    user.id,
    await context.password.hash(input.password)
  );
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.accountLink.deleteMany({ where: { email: target.email } });

  try {
    await auth.api.signInEmail({
      body: { email: target.email, password: input.password },
    });
  } catch {
    // The password did change; only the courtesy of arriving signed in did
    // not. The sign-in system page is one click away and will take it.
    return null;
  }
  return null;
}

/**
 * « Mot de passe oublié », asked by whoever is at the keyboard — no person, so
 * no check, and deliberately no answer about the address either: the link
 * goes to it or nowhere, and the system page says the same thing in both cases.
 * Returning it would let anyone harvest a reset link for an address they
 * merely guessed.
 *
 * What *is* answered is whether the wiki could send at all, because promising
 * a mail that never leaves sends the person waiting for nothing. That answer
 * is address-independent — an address with no account makes the wiki prove it
 * could have sent (probeMailer) — so it reveals nothing the silence did not.
 */
export async function requestPasswordReset(
  email: string
): Promise<MailFailure | null> {
  const address = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { disabledAt: true },
  });
  if (!user || user.disabledAt !== null) return probeMailer();
  const url = await mintLink(address, RESET_LIFETIME_DAYS, null);
  return sendAccountLink({ to: address, url, purpose: "reset" });
}

/**
 * Spends whatever link stood on an address, once an account is there by some
 * other way — free sign-up on an invited address. Left behind, the row would
 * read as a password reset for the account just created (readAccountLink
 * decides by the accounts table), and the old invitation would take it over.
 */
export async function clearAccountLink(email: string): Promise<void> {
  await prisma.accountLink.deleteMany({ where: { email: email.toLowerCase() } });
}
