import { createHash, randomBytes } from "node:crypto";
import { APIError } from "better-auth/api";
import {
  type AccountAction,
  deleteRefusal,
  disableRefusal,
} from "@/modules/accounts/rules";
import { sweepAclReferences } from "@/modules/permissions/acl-rename-sweep";
import { auth } from "@/modules/accounts/auth";
import { countFormsOwnedByAccount, reassignOwnedForms } from "@/modules/forms/forms";
import { inheritedGroups } from "@/modules/permissions/groups";
import {
  type NamedGroup,
  groupNames,
  joinGroupOnInvitation,
  listAdminUsernames,
  listNestings,
} from "@/modules/permissions/groups-queries";
import {
  INVITATION_LIFETIME_DAYS,
  INVITATION_TOKEN_PARAM,
  type InvitationReport,
  type LinkPurpose,
  type MailFailure,
  RESET_LIFETIME_DAYS,
  expiresIn,
} from "@/modules/accounts/invitations";
import { probeMailer, sendAccountLink } from "@/modules/accounts/mailer";
import { countOwnedByAccount, reassignOwnedPages } from "@/modules/pages/rights";
import type { Identity } from "@/modules/permissions/rules";
import { assertAdmin, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { authPagePath } from "@/wiki.config";

// The accounts half of `gerer-utilisateurs` (docs/permissions.md § Comptes):
// how a person gets in, and the two ways they stop getting in. Every action
// here but three is an administrator's, and the check sits in the guards rather
// than in the callers (ADR 0025) — the three exceptions are the ones a
// stranger holding a link performs, and each says so in its own comment.
//
// An administrator never sets a password. What they hand over is a single-use
// link, and the same link answers three needs: an invitation when the address
// holds no account, a reset when it does. Which one it is, nobody stores —
// the accounts table already knows.

/** Why an account action was refused, or null once it went through. */
export type AccountRefusal = string | null;

/**
 * Expired, already used, or never issued: one answer for the three. Telling
 * them apart would only teach whoever is holding a link they should not have,
 * and the way forward is the same in every case.
 */
const SPENT_LINK = "Ce lien n'est plus valable. Demandez-en un nouveau.";

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
  // The system page that accepts the link is the `invitation` wiki page, so the
  // token travels as a query parameter: a segment behind the slug would be
  // read as a page handler (ADR 0028).
  const path = `${authPagePath("invitation")}?${INVITATION_TOKEN_PARAM}=${token}`;
  return absoluteUrl(path);
}

/** A minted link, and what became of the attempt to deliver it by mail. */
export interface DeliveredLink {
  url: string;
  /** null once the mail left; otherwise why it did not. */
  failure: MailFailure | null;
}

async function deliver(
  email: string,
  url: string,
  purpose: LinkPurpose
): Promise<DeliveredLink> {
  return { url, failure: await sendAccountLink({ to: email, url, purpose }) };
}

// --- reads --------------------------------------------------------------------

export interface UserRow extends Identity {
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
 * system page where email addresses are shown.
 */
export async function listUsersWithGroups(): Promise<UserRow[]> {
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
  links: (DeliveredLink & { email: string })[];
}

/**
 * Invites a list of addresses at once (docs/permissions.md § Naissance d'un
 * compte). An address that already holds an account is reported and left
 * alone; so is one whose invitation is still live — resending that one is a
 * action of its own, on its own line. An expired link is not: it opens
 * nothing any more, so pasting the address again simply invites afresh.
 */
export async function inviteAddresses(
  emails: readonly string[],
  groupSlug: string | null,
  invalid: readonly string[] = []
): Promise<InvitationOutcome> {
  await assertAdmin();
  const now = new Date();
  const [members, invited] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: [...emails] } },
      select: { email: true },
    }),
    prisma.accountLink.findMany({
      where: { email: { in: [...emails] }, expiresAt: { gt: now } },
      select: { email: true },
    }),
  ]);
  const hasAccount = new Set(members.map((user) => user.email));
  const hasLiveInvitation = new Set(invited.map((link) => link.email));

  const report: InvitationReport = {
    invited: [],
    alreadyMember: [],
    alreadyInvited: [],
    invalid: [...invalid],
  };
  const links: (DeliveredLink & { email: string })[] = [];

  for (const email of emails) {
    if (hasAccount.has(email)) {
      report.alreadyMember.push(email);
      continue;
    }
    if (hasLiveInvitation.has(email)) {
      report.alreadyInvited.push(email);
      continue;
    }
    const url = await openLink(email, INVITATION_LIFETIME_DAYS, groupSlug);
    report.invited.push(email);
    // Each link carries what became of its own mail: one verdict for the
    // batch would tell an address whose mail left that it failed.
    links.push({ email, ...(await deliver(email, url, "invitation")) });
  }
  return { report, links };
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
 * Spends whatever link stood on an address, once an account is there by some
 * other way — free sign-up on an invited address. Left behind, the row would
 * read as a password reset for the account just created (readAccountLink
 * decides by the accounts table), and the old invitation would take it over.
 */
export async function clearAccountLink(email: string): Promise<void> {
  await prisma.accountLink.deleteMany({ where: { email: email.toLowerCase() } });
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
    select: { email: true, disabledAt: true },
  });
  // A disabled account gets no link: it would open on « ce lien n'est plus
  // valable », since a link never reopens an access somebody closed.
  if (!user || user.disabledAt) return null;
  const url = await openLink(user.email, RESET_LIFETIME_DAYS, null);
  return deliver(user.email, url, "reset");
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
  const url = await openLink(address, RESET_LIFETIME_DAYS, null);
  return sendAccountLink({ to: address, url, purpose: "reset" });
}

// --- accepting a link ---------------------------------------------------------

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

// --- disabling and erasing ----------------------------------------------------

/**
 * The last administrator standing: an account whose loss would leave nobody
 * able to administer the wiki. Direct members only — nesting never makes an
 * administrator (docs/permissions.md § Groupes) — and disabled ones do not
 * count, since an account that cannot sign in cannot take anything back.
 */
async function isLastAdmin(username: string): Promise<boolean> {
  const admins = await listAdminUsernames();
  if (!admins.includes(username)) return false;

  const others = admins.filter((member) => member !== username);
  if (others.length === 0) return true;
  const stillThere = await prisma.user.count({
    where: { username: { in: others }, disabledAt: null },
  });
  return stillThere === 0;
}

async function actionOn(username: string): Promise<AccountAction> {
  return {
    username,
    personUsername: await currentUsername(),
    lastAdmin: await isLastAdmin(username),
  };
}

/**
 * « Cette personne n'est plus des nôtres » — the everyday action, and a
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

  const refusal = disableRefusal(await actionOn(username));
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
  return countErasure(username);
}

/**
 * The same numbers, for whoever is asking about their own account — no
 * administrator involved, since the only account this can ever describe is
 * the one already signed in.
 */
export async function ownDeletionImpact(): Promise<AccountDeletionImpact | null> {
  const username = await currentUsername();
  if (!username) return null;
  return countErasure(username);
}

async function countErasure(username: string): Promise<AccountDeletionImpact> {
  const [owned, forms, action] = await Promise.all([
    countOwnedByAccount(username),
    countFormsOwnedByAccount(username),
    actionOn(username),
  ]);
  return {
    pages: owned.pages,
    forms,
    revisions: owned.revisions,
    refusal: deleteRefusal(action),
  };
}

/**
 * The erasure an administrator carries out (docs/permissions.md § Fin d'un
 * compte). Reassignment first, when one was chosen; then the plain DELETE.
 */
export async function deleteAccount(
  username: string,
  reassignToUsername: string | null
): Promise<AccountRefusal> {
  await assertAdmin();
  const refusal = deleteRefusal(await actionOn(username));
  if (refusal) return refusal;

  if (reassignToUsername) {
    await reassignOwnedPages(username, reassignToUsername);
    await reassignOwnedForms(username, reassignToUsername);
  }
  return erase(username);
}

/**
 * The erasure someone asks for themselves — the droit à l'effacement, which
 * belongs to the person and not to an administrator's goodwill. It needs no
 * check beyond being signed in, because it reaches exactly one account: the
 * one acting. Nothing is reassigned: handing pages to a named colleague would
 * mean showing a departing user the list of everyone else, and « Anonyme » is
 * what an erasure asks for anyway.
 */
export async function deleteOwnAccount(): Promise<AccountRefusal> {
  const username = await currentUsername();
  if (!username) return "Vous n'êtes pas connecté.";
  const refusal = deleteRefusal(await actionOn(username));
  if (refusal) return refusal;
  return erase(username);
}

/**
 * The DELETE itself: the `onDelete` of each relation does the rest —
 * memberships, sessions and pending link gone with the account, pages and
 * history staying, signed « Anonyme » (ADR 0024). One transaction beyond the
 * cascade: the field rights and form defaults naming this username live in
 * `Form.schema`, which no foreign key reaches (ADR 0024), so the sweep runs
 * here rather than trusting Postgres to have done it.
 */
async function erase(username: string): Promise<AccountRefusal> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, email: true },
  });
  if (!user) return null;
  await prisma.$transaction(async (tx) => {
    await tx.accountLink.deleteMany({ where: { email: user.email } });
    await tx.user.delete({ where: { id: user.id } });
    await sweepAclReferences(tx, {
      kind: "username",
      from: username,
      to: null,
    });
  });
  return null;
}
