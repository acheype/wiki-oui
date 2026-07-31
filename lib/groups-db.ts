import { cache } from "react";
import {
  type InheritedMember,
  type MemberRef,
  type Nesting,
  acceptsNestedGroups,
  effectiveGroups,
  inheritedMembers,
  isProtectedGroup,
  memberRemovalRefusal,
  nestingCycle,
  nestingCycleMessage,
} from "@/lib/groups";
import { ADMINS_GROUP } from "@/lib/permissions";
import { currentUsername } from "@/lib/permissions-db";
import { prisma } from "@/lib/prisma";

// The database side of the groups (docs/permissions.md § Groupes): it loads
// the nesting, hands it to the pure module and writes the verdict back. Every
// gesture that changes a group passes through here, and every one of them is
// an administrator's — v0.5 gives group edition to nobody else, so the check
// lives at the door rather than in each caller (ADR 0025).
//
// The nesting is resolved in memory, not by a recursive query: the same edges
// answer the actor's effective groups, the cycle refusal and the « via
// @Bureau › @Trésorerie » of the screens. Group-to-group edges are few — one
// per nesting in the whole wiki — where user memberships are many.

/** What a person's line and a group's chip need to name someone. */
const PERSON = { select: { username: true, name: true } } as const;

const ADMINISTRATORS_ONLY = "Réservé aux administrateurs.";

// --- the actor's groups ------------------------------------------------------

/**
 * Every group the current actor counts as a member of, memoized for the
 * duration of the request with React's cache() — the pattern lib/pages.ts
 * already uses. Deliberately never carried in the session: removing someone
 * from a group has to take effect at once, not when their session renews.
 */
export const currentGroupSlugs = cache(async (): Promise<string[]> => {
  const username = await currentUsername();
  if (!username) return [];
  const [direct, nestings] = await Promise.all([
    prisma.groupMember.findMany({
      where: { username },
      select: { groupSlug: true },
    }),
    listNestings(),
  ]);
  return effectiveGroups(
    nestings,
    direct.map((membership) => membership.groupSlug)
  );
});

/**
 * The administrator access level: a membership of @Admins, nesting resolved —
 * except that @Admins holds no group, so the resolution can only ever confirm
 * a direct membership. Reading it through the same door keeps a single answer
 * to « who is an administrator ».
 */
export async function isCurrentAdmin(): Promise<boolean> {
  return (await currentGroupSlugs()).includes(ADMINS_GROUP.slug);
}

/**
 * The check every gesture of the two administration screens passes, here
 * rather than in each caller (ADR 0025) — lib/accounts-db.ts holds the other
 * half of `gerer-utilisateurs` and asks for it by name.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isCurrentAdmin())) throw new Error(ADMINISTRATORS_ONLY);
}

// --- reads -------------------------------------------------------------------

/** Every group-to-group edge of the wiki: the nesting, and nothing else. */
export async function listNestings(): Promise<Nesting[]> {
  const nested = await prisma.groupMember.findMany({
    where: { memberGroupSlug: { not: null } },
    select: { groupSlug: true, memberGroupSlug: true },
  });
  return nested.map((edge) => ({
    groupSlug: edge.groupSlug,
    memberGroupSlug: edge.memberGroupSlug!,
  }));
}

/** Every person-in-a-group edge of the wiki. */
async function listMemberships() {
  const held = await prisma.groupMember.findMany({
    where: { username: { not: null } },
    select: { groupSlug: true, username: true },
  });
  return held.map((membership) => ({
    groupSlug: membership.groupSlug,
    username: membership.username!,
  }));
}

export interface Person {
  username: string;
  name: string;
}

export interface NamedGroup {
  slug: string;
  name: string;
}

/** Every person of the wiki, as a screen names them. */
async function listPeople(): Promise<Person[]> {
  const users = await prisma.user.findMany({
    ...PERSON,
    orderBy: { name: "asc" },
  });
  return users.flatMap((user) =>
    // The username is what a right, an ownership or a membership points at
    // (ADR 0024): an account without one is invisible to all of them.
    user.username ? [{ username: user.username, name: user.name }] : []
  );
}

/** A group's display name from its slug, for the paths screens print. */
export function groupNames(groups: NamedGroup[]): Map<string, string> {
  return new Map(groups.map((group) => [group.slug, group.name]));
}

export interface GroupSummary {
  slug: string;
  name: string;
  /** People held, nesting resolved — what the group actually grants to. */
  peopleCount: number;
  /** @Admins: neither renamable nor deletable, and people only. */
  protected: boolean;
}

/** The groups of the wiki, named and counted, alphabetically. */
export async function listGroupSummaries(): Promise<GroupSummary[]> {
  await assertAdmin();
  const [groups, nestings, memberships] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listNestings(),
    listMemberships(),
  ]);
  return groups.map((group) => {
    const direct = memberships.filter(
      (membership) => membership.groupSlug === group.slug
    );
    const inherited = inheritedMembers(nestings, memberships, group.slug);
    return {
      slug: group.slug,
      name: group.name,
      peopleCount: direct.length + inherited.length,
      protected: isProtectedGroup(group.slug),
    };
  });
}

/** Someone the group holds through its nesting, and the way they come in by. */
export interface InheritedPerson extends Person {
  path: NamedGroup[];
}

export interface GroupDetail {
  slug: string;
  name: string;
  protected: boolean;
  /** Removable: they were put there by hand. */
  people: Person[];
  /** Nested groups, also removable — never any for @Admins. */
  groups: NamedGroup[];
  /** Observed, not editable: to remove them, edit the group they are in. */
  inherited: InheritedPerson[];
  /** Direct and inherited people together, counted once each. */
  peopleCount: number;
  /** Groups this one may still take in: itself excluded, members excluded. */
  addableGroups: NamedGroup[];
  /** People it may still take in. */
  addablePeople: Person[];
}

export async function getGroupDetail(
  slug: string
): Promise<GroupDetail | null> {
  await assertAdmin();
  const [group, groups, users, nestings, memberships] = await Promise.all([
    prisma.group.findUnique({
      where: { slug },
      include: {
        members: {
          include: { user: PERSON, memberGroup: true },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listPeople(),
    listNestings(),
    listMemberships(),
  ]);
  if (!group) return null;

  const nameOf = groupNames(groups);
  const people = group.members
    .flatMap((member) =>
      // The username is what a membership points at (ADR 0024), so a member
      // without one cannot exist — the flatMap is the type's due, not a case.
      member.user?.username
        ? [{ username: member.user.username, name: member.user.name }]
        : []
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const nestedGroups = group.members
    .flatMap((member) => (member.memberGroup ? [member.memberGroup] : []))
    .map((nested) => ({ slug: nested.slug, name: nested.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const inherited = namePeople(
    inheritedMembers(nestings, memberships, slug),
    users,
    nameOf
  );
  const direct = new Set(people.map((person) => person.username));
  const held = new Set([
    ...direct,
    ...inherited.map((person) => person.username),
  ]);
  const nestedSlugs = new Set(nestedGroups.map((nested) => nested.slug));

  return {
    slug: group.slug,
    name: group.name,
    protected: isProtectedGroup(group.slug),
    people,
    groups: nestedGroups,
    inherited,
    peopleCount: held.size,
    // A group that would close a cycle stays on offer: the refusal names the
    // way back, which teaches the nesting; a silently shorter list would not.
    addableGroups: acceptsNestedGroups(slug)
      ? groups
          .filter((one) => one.slug !== slug && !nestedSlugs.has(one.slug))
          .map((one) => ({ slug: one.slug, name: one.name }))
      : [],
    // Only direct members are off the list: someone the nesting brings in can
    // still be added by hand, which pins them here whatever happens to the
    // group they came through. They then show up once, as a chip.
    addablePeople: users.filter((person) => !direct.has(person.username)),
  };
}

/** Turns the slug paths of the pure module into what a screen can print. */
function namePeople(
  members: InheritedMember[],
  people: Person[],
  nameOf: Map<string, string>
): InheritedPerson[] {
  const displayName = new Map(
    people.map((person) => [person.username, person.name])
  );
  return members.map((member) => ({
    username: member.username,
    name: displayName.get(member.username) ?? member.username,
    path: member.path.map((slug) => ({ slug, name: nameOf.get(slug) ?? slug })),
  }));
}

// --- writes ------------------------------------------------------------------

/**
 * Creates @Admins around its first member, the account the installation
 * screen just made (ADR 0027). Idempotent, so a retried installation
 * converges instead of failing halfway — and actor-free, since it runs
 * before anyone can be an administrator.
 */
export async function createAdminsGroupWith(username: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.group.upsert({
      where: { slug: ADMINS_GROUP.slug },
      create: { slug: ADMINS_GROUP.slug, name: ADMINS_GROUP.name },
      update: {},
    });
    await tx.groupMember.upsert({
      where: {
        groupSlug_username: { groupSlug: ADMINS_GROUP.slug, username },
      },
      create: { groupSlug: ADMINS_GROUP.slug, username },
      update: {},
    });
  });
}

export async function groupExists(slug: string): Promise<boolean> {
  await assertAdmin();
  return (await prisma.group.count({ where: { slug } })) > 0;
}

export async function insertGroup(group: NamedGroup): Promise<void> {
  await assertAdmin();
  await prisma.group.create({ data: { slug: group.slug, name: group.name } });
}

/** The display name only: the slug is the identity, frozen at creation. */
export async function updateGroupName(slug: string, name: string): Promise<void> {
  await assertAdmin();
  await prisma.group.update({ where: { slug }, data: { name } });
}

export async function deleteGroupBySlug(slug: string): Promise<void> {
  await assertAdmin();
  await prisma.group.delete({ where: { slug } });
}

/** Why a membership was refused, or null once it is in. */
export type MembershipRefusal = string | null;

export async function addPersonToGroup(
  groupSlug: string,
  username: string
): Promise<void> {
  await assertAdmin();
  await prisma.groupMember.upsert({
    where: { groupSlug_username: { groupSlug, username } },
    create: { groupSlug, username },
    update: {},
  });
}

/**
 * Nests a group into another, unless that closes a cycle — refused with the
 * way back named, « @Rédacteurs contient déjà @Bureau, via @Trésorerie. »
 */
export async function nestGroup(
  groupSlug: string,
  memberGroupSlug: string
): Promise<MembershipRefusal> {
  await assertAdmin();
  if (!acceptsNestedGroups(groupSlug)) {
    return "Ce groupe n'accepte que des personnes.";
  }
  const [nestings, groups] = await Promise.all([
    listNestings(),
    prisma.group.findMany({ select: { slug: true, name: true } }),
  ]);
  const cycle = nestingCycle(nestings, { groupSlug, memberGroupSlug });
  if (cycle) {
    const nameOf = groupNames(groups);
    return nestingCycleMessage(cycle.map((slug) => nameOf.get(slug) ?? slug));
  }
  await prisma.groupMember.upsert({
    where: { groupSlug_memberGroupSlug: { groupSlug, memberGroupSlug } },
    create: { groupSlug, memberGroupSlug },
    update: {},
  });
  return null;
}

/**
 * Takes a member out — refused only when it would empty @Admins, and the
 * count that decides is the direct one: nesting never makes an administrator.
 */
export async function removeGroupMember(
  groupSlug: string,
  member: MemberRef
): Promise<MembershipRefusal> {
  await assertAdmin();
  const refusal = memberRemovalRefusal({
    groupSlug,
    memberCount: await prisma.groupMember.count({ where: { groupSlug } }),
  });
  if (refusal) return refusal;

  await prisma.groupMember.deleteMany({
    where: {
      groupSlug,
      ...("username" in member
        ? { username: member.username }
        : { memberGroupSlug: member.groupSlug }),
    },
  });
  return null;
}
