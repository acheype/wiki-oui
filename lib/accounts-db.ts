import { createHash, randomBytes } from "node:crypto";
import { APIError } from "better-auth/api";
import {
  type AccountGesture,
  deleteRefusal,
  disableRefusal,
} from "@/lib/accounts";
import { auth } from "@/lib/auth";
import { countFormsOwnedByAccount, reassignOwnedForms } from "@/lib/forms";
import { inheritedGroups } from "@/lib/groups";
import {
  type NamedGroup,
  type Person,
  assertAdmin,
  groupNames,
  listNestings,
} from "@/lib/groups-db";
import {
  INVITATION_LIFETIME_DAYS,
  type InvitationReport,
  type MailDelivery,
  RESET_LIFETIME_DAYS,
  expiresIn,
} from "@/lib/invitations";
import { sendAccountLink } from "@/lib/mailer";
import { countOwnedByAccount, reassignOwnedPages } from "@/lib/pages";
import { ADMINS_GROUP } from "@/lib/permissions";
import { currentUsername } from "@/lib/permissions-db";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";

// The accounts half of `gerer-utilisateurs` (docs/permissions.md § Comptes):
// how a person gets in, and the two ways they stop getting in. Every gesture
// here but three is an administrator's, and the check sits at the door rather
// than in the callers (ADR 0025) — the three exceptions are the ones a
// stranger holding a link performs, and each says so in its own comment.
//
// An administrator never sets a password. What they hand over is a single-use
// link, and the same link answers three needs: an invitation when the address
// holds no account, a reset when it does. Which one it is, nobody stores —
// the accounts table already knows.

/** Where a link leads, and where the accepting screen lives. */
const INVITATION_PATH = "/invitation";

/** Why an account gesture was refused, or null once it went through. */
export type AccountRefusal = string | null;

// --- the link primitive -------------------------------------------------------

/**
 * A link is a secret in an address bar, so it is minted like one and stored
 * like one: 32 random bytes for what travels, its SHA-256 for what the
 * database keeps. A stolen dump then opens nothing, and nobody — including an
 * administrator reading the table — can replay a link they did not receive.
 */
function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: fingerprint(token) };
}

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Puts a live link on an address, replacing whatever was there: one door per
 * address, never two. This is where the duplicates of a pasted list actually
 * merge — the parser only reads, the unique index decides.
 */
async function openLink(
  email: string,
  lifetimeDays: number,
  groupSlug: string | null
): Promise<string> {
  const { token, tokenHash } = mintToken();
  const expiresAt = expiresIn(new Date(), lifetimeDays);
  await prisma.accountLink.upsert({
    where: { email },
    create: { email, tokenHash, expiresAt, groupSlug },
    update: { tokenHash, expiresAt, groupSlug },
  });
  return absoluteUrl(`${INVITATION_PATH}/${token}`);
}

/** A minted link, and what became of the attempt to deliver it by mail. */
export interface DeliveredLink {
  url: string;
  delivery: MailDelivery;
}

async function deliver(
  email: string,
  url: string,
  purpose: "invitation" | "reset"
): Promise<DeliveredLink> {
  return { url, delivery: await sendAccountLink({ to: email, url, purpose }) };
}

// --- reads --------------------------------------------------------------------

export interface AccountRow extends Person {
  /** Shown here and nowhere else in the wiki (docs/permissions.md). */
  email: string;
  /** Access cut: sign-in refused, everything they own left as it was. */
  disabled: boolean;
  groups: NamedGroup[];
  inherited: { group: NamedGroup; path: NamedGroup[] }[];
}

/**
 * The people of the wiki with their groups, direct and inherited — the
 * accounts list of `gerer-utilisateurs`. Administrators only: it is the one
 * screen where email addresses are shown.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  await assertAdmin();
  const [users, groups, nestings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        username: true,
        name: true,
        email: true,
        disabledAt: true,
        groupMemberships: { select: { groupSlug: true } },
      },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listNestings(),
  ]);
  const nameOf = groupNames(groups);
  const named = (slug: string) => ({ slug, name: nameOf.get(slug) ?? slug });

  return users.flatMap((user) => {
    // The username is what a right, an ownership or a membership points at
    // (ADR 0024): an account without one is invisible to all of them.
    if (!user.username) return [];
    const direct = user.groupMemberships.map(
      (membership) => membership.groupSlug
    );
    return [
      {
        username: user.username,
        name: user.name,
        email: user.email,
        disabled: user.disabledAt !== null,
        groups: direct.map(named).sort((a, b) => a.name.localeCompare(b.name)),
        inherited: inheritedGroups(nestings, direct).map((group) => ({
          group: named(group.slug),
          path: group.path.map(named),
        })),
      },
    ];
  });
}

export interface PendingInvitation {
  email: string;
  invitedAt: Date;
  /** Past its date: still listed, since the answer is to send another. */
  expired: boolean;
  /** « Ajouter aussi au groupe », null when none was chosen. */
  group: NamedGroup | null;
}

/**
 * The addresses invited and not yet arrived. A link on an address that holds
 * an account is a password reset, not an invitation — so the accounts table
 * is what tells the two apart, and nothing has to be stored to say which.
 */
export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  await assertAdmin();
  const links = await prisma.accountLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { group: true },
  });
  if (links.length === 0) return [];

  const arrived = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: links.map((link) => link.email) } },
        select: { email: true },
      })
    ).map((user) => user.email)
  );
  const now = new Date();
  return links
    .filter((link) => !arrived.has(link.email))
    .map((link) => ({
      email: link.email,
      invitedAt: link.createdAt,
      expired: link.expiresAt < now,
      group: link.group && { slug: link.group.slug, name: link.group.name },
    }));
}

// --- inviting -----------------------------------------------------------------

export interface InvitationOutcome {
  report: InvitationReport;
  /** One per address actually invited, for the administrator to copy. */
  links: { email: string; url: string }[];
  /** How the mails went: nothing was attempted when SMTP is unconfigured. */
  delivery: MailDelivery;
}

/**
 * Invites a list of addresses at once (docs/permissions.md § Naissance d'un
 * compte). An address that already holds an account is reported and left
 * alone; one that already has a pending invitation keeps it, link and date
 * included — resending is a gesture of its own, on its own line.
 */
export async function inviteAddresses(
  emails: readonly string[],
  groupSlug: string | null,
  invalid: readonly string[] = []
): Promise<InvitationOutcome> {
  await assertAdmin();
  const [members, invited] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: [...emails] } },
      select: { email: true },
    }),
    prisma.accountLink.findMany({
      where: { email: { in: [...emails] } },
      select: { email: true },
    }),
  ]);
  const hasAccount = new Set(members.map((user) => user.email));
  const hasInvitation = new Set(invited.map((link) => link.email));

  const report: InvitationReport = {
    invited: [],
    alreadyMember: [],
    alreadyInvited: [],
    invalid: [...invalid],
  };
  const links: { email: string; url: string }[] = [];
  let delivery: MailDelivery = "not-configured";

  for (const email of emails) {
    if (hasAccount.has(email)) {
      report.alreadyMember.push(email);
      continue;
    }
    if (hasInvitation.has(email)) {
      report.alreadyInvited.push(email);
      continue;
    }
    const url = await openLink(email, INVITATION_LIFETIME_DAYS, groupSlug);
    const sent = await deliver(email, url, "invitation");
    report.invited.push(email);
    links.push({ email, url });
    // One verdict for the batch: what matters to the screen is whether it
    // must show the links, and a single failure means it must.
    if (sent.delivery !== "sent") delivery = sent.delivery;
    else if (delivery === "not-configured") delivery = "sent";
  }
  return { report, links, delivery };
}

/** Mints a fresh link for a pending invitation — the old one stops working. */
export async function resendInvitation(email: string): Promise<DeliveredLink> {
  await assertAdmin();
  const existing = await prisma.accountLink.findUnique({ where: { email } });
  const url = await openLink(
    email,
    INVITATION_LIFETIME_DAYS,
    existing?.groupSlug ?? null
  );
  return deliver(email, url, "invitation");
}

export async function revokeInvitation(email: string): Promise<void> {
  await assertAdmin();
  await prisma.accountLink.deleteMany({ where: { email } });
}

/**
 * The reset an administrator triggers — « je lui renvoie un lien ». Same
 * primitive as an invitation, shorter fuse, and still no password set by
 * anyone but the person themselves.
 */
export async function createResetLink(
  username: string
): Promise<DeliveredLink | null> {
  await assertAdmin();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { email: true },
  });
  if (!user) return null;
  const url = await openLink(user.email, RESET_LIFETIME_DAYS, null);
  return deliver(user.email, url, "reset");
}

/**
 * « Mot de passe oublié », asked by whoever is at the keyboard — no actor, so
 * no check, and deliberately no answer either: the link goes to the address
 * or nowhere, and the screen says the same thing in both cases. Returning it
 * would let anyone harvest a reset link for an address they merely guessed.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { disabledAt: true },
  });
  if (!user || user.disabledAt !== null) return;
  const url = await openLink(address, RESET_LIFETIME_DAYS, null);
  await sendAccountLink({ to: address, url, purpose: "reset" });
}

// --- accepting a link ---------------------------------------------------------

/** What the link's screen must know to draw itself. */
export interface AccountLinkTarget {
  email: string;
  /** An invitation creates the account; a reset only changes its password. */
  purpose: "invitation" | "reset";
  /** The group the invitation adds to, named for the screen to announce it. */
  group: NamedGroup | null;
  /** The account the reset is for, so the screen can greet it by name. */
  name: string | null;
}

/**
 * Reads a link without spending it: whoever holds it is a stranger to the
 * wiki, so there is no actor to check — the token is the whole credential,
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
 * No actor: the token is the credential. What it authorizes is exactly one
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
    return "Ce lien n'est plus valable. Demandez-en un nouveau.";
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
    // Written here rather than through the groups door: the person joining is
    // nobody's administrator, and what allows this membership is the
    // invitation that named the group when an administrator did have the say.
    await prisma.groupMember.upsert({
      where: {
        groupSlug_username: {
          groupSlug: target.group.slug,
          username: input.username,
        },
      },
      create: { groupSlug: target.group.slug, username: input.username },
      update: {},
    });
  }
  return null;
}

/**
 * A collision on the identifier asks for another one, never appends a suffix
 * (docs/permissions.md § Identité) — the identifier is public and permanent,
 * so `marie-durand-2` would be a name nobody chose.
 */
function signUpRefusal(error: unknown): string {
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
    return "Ce lien n'est plus valable. Demandez-en un nouveau.";
  }

  const user = await prisma.user.findUnique({
    where: { email: target.email },
    select: { id: true },
  });
  if (!user) return "Ce lien n'est plus valable. Demandez-en un nouveau.";

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
    // not. The sign-in screen is one click away and will take it.
    return null;
  }
  return null;
}

// --- disabling and erasing ----------------------------------------------------

/**
 * The last administrator standing: an account whose loss would leave nobody
 * able to administer the wiki. Direct members only — nesting never makes an
 * administrator (docs/permissions.md § Groupes) — and disabled ones do not
 * count, since an account that cannot sign in cannot take anything back.
 */
async function isLastAdmin(username: string): Promise<boolean> {
  const admins = await prisma.groupMember.findMany({
    where: { groupSlug: ADMINS_GROUP.slug, username: { not: null } },
    select: { username: true },
  });
  if (!admins.some((member) => member.username === username)) return false;

  const others = admins
    .map((member) => member.username!)
    .filter((member) => member !== username);
  if (others.length === 0) return true;
  const stillThere = await prisma.user.count({
    where: { username: { in: others }, disabledAt: null },
  });
  return stillThere === 0;
}

async function gestureOn(username: string): Promise<AccountGesture> {
  return {
    username,
    actorUsername: await currentUsername(),
    lastAdmin: await isLastAdmin(username),
  };
}

/**
 * « Cette personne n'est plus des nôtres » — the everyday gesture, and a
 * reversible one: sign-in refused and sessions revoked at once, ownership and
 * authorship untouched, one click back the other way.
 */
export async function setAccountDisabled(
  username: string,
  disabled: boolean
): Promise<AccountRefusal> {
  await assertAdmin();
  if (!disabled) {
    await prisma.user.update({
      where: { username },
      data: { disabledAt: null },
    });
    return null;
  }

  const refusal = disableRefusal(await gestureOn(username));
  if (refusal) return refusal;
  await prisma.user.update({
    where: { username },
    data: {
      disabledAt: new Date(),
      // Revoked, not left to expire: « refuse the next sign-in » would leave
      // whoever is already signed in inside for as long as their session lasts.
      sessions: { deleteMany: {} },
    },
  });
  return null;
}

export interface AccountDeletionImpact {
  pages: number;
  forms: number;
  revisions: number;
  /** Why the deletion cannot happen at all, null when it can. */
  refusal: AccountRefusal;
}

/** The numbers the deletion modal announces, before anything is decided. */
export async function accountDeletionImpact(
  username: string
): Promise<AccountDeletionImpact> {
  await assertAdmin();
  const [owned, forms, gesture] = await Promise.all([
    countOwnedByAccount(username),
    countFormsOwnedByAccount(username),
    gestureOn(username),
  ]);
  return {
    pages: owned.pages,
    forms,
    revisions: owned.revisions,
    refusal: deleteRefusal(gesture),
  };
}

/**
 * The erasure that was asked for (docs/permissions.md § Fin d'un compte).
 * Reassignment first, when one was chosen; then a plain DELETE, and the
 * `onDelete` of each relation does the rest — memberships and pending link
 * gone with the account, pages and history staying, signed « Anonyme ».
 */
export async function deleteAccount(
  username: string,
  reassignToUsername: string | null
): Promise<AccountRefusal> {
  await assertAdmin();
  const refusal = deleteRefusal(await gestureOn(username));
  if (refusal) return refusal;

  if (reassignToUsername) {
    await reassignOwnedPages(username, reassignToUsername);
    await reassignOwnedForms(username, reassignToUsername);
  }
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, email: true },
  });
  if (!user) return null;
  await prisma.accountLink.deleteMany({ where: { email: user.email } });
  await prisma.user.delete({ where: { id: user.id } });
  return null;
}
