import { inheritedGroups } from "@/modules/permissions/groups-nesting";
import {
  type NamedGroup,
  groupNames,
  listNestings,
} from "@/modules/permissions/groups-directory";
import type { Identity } from "@/modules/permissions/rules";
import { assertAdmin } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// The reads of `gerer-utilisateurs` (docs/permissions.md § Comptes). Guards by
// capacity rather than by named resource: what they decide is whether this
// person reaches the administration panel at all, and the check sits here
// rather than in the callers (ADR 0025) — it is the one system page where
// email addresses are shown.

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
