import { cache } from "react";
import { sweepAclReferences } from "@/modules/permissions/acl-rename-sweep";
import type { GrantTarget } from "@/modules/permissions/bulk";
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
  refGroupSlug,
  refUsername,
} from "@/modules/permissions/groups";
import { type AclDirectory, type Identity, ADMINS_GROUP } from "@/modules/permissions/rules";
import { assertAdmin, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// The database side of the groups (docs/permissions.md § Groupes): it loads
// the nesting, hands it to the pure module and writes the verdict back. Every
// action that changes a group passes through here, and every one of them is
// an administrator's — v0.5 gives group edition to nobody else, so the check
// lives at the door rather than in each caller (ADR 0025).
//
// The nesting is resolved in memory, not by a recursive query: the same edges
// answer the person's effective groups, the cycle refusal and the « via
// @Bureau › @Trésorerie » of the system pages. Group-to-group edges are few — one
// per nesting in the whole wiki — where user memberships are many.

/** What a person's line and a group's chip need to name someone. */
const PERSON = { select: { username: true, name: true } } as const;

// --- the person's groups ------------------------------------------------------

/**
 * Every group the current person counts as a member of, memoized for the
 * duration of the request with React's cache() — the pattern
 * modules/pages/content.ts already uses. Deliberately never carried in the session: removing someone
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
 * The same question asked about someone other than the person: which groups
 * reach a person or a group named in a rights list. Nesting runs upwards, so
 * a group's own answer holds the groups that contain it — whoever is granted
 * @Rédacteurs is already granting @Bureau, nested inside it.
 *
 * What « Donner accès » counts as « y donne déjà accès » (modules/permissions/bulk.ts)
 * rests on this: a line that only repeats what a group already carries adds
 * nothing.
 */
export async function reachingGroups(ref: MemberRef): Promise<string[]> {
  const nestings = await listNestings();
  const username = refUsername(ref);
  if (username === null) {
    return effectiveGroups(nestings, [refGroupSlug(ref)!]);
  }
  const direct = await prisma.groupMember.findMany({
    where: { username },
    select: { groupSlug: true },
  });
  return effectiveGroups(
    nestings,
    direct.map((membership) => membership.groupSlug)
  );
}

/**
 * A principal as « Donner accès » counts and prints them: the name the note
 * says, and the groups that reach them. Null when the account or the group has
 * gone since the picker listed it — the lot then names one fewer, rather than
 * writing a row pointing at nothing.
 */
export async function grantTarget(ref: MemberRef): Promise<GrantTarget | null> {
  const groupSlugs = await reachingGroups(ref);
  const username = refUsername(ref);
  if (username === null) {
    const group = await prisma.group.findUnique({
      where: { slug: refGroupSlug(ref)! },
      select: { name: true },
    });
    return group && { label: `@${group.name}`, ref, groupSlugs };
  }
  const person = await prisma.user.findUnique({
    where: { username },
    select: { name: true },
  });
  return person && { label: person.name, ref, groupSlugs };
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

export interface NamedGroup {
  slug: string;
  name: string;
}

/** Every person of the wiki, as a system page names them. */
async function listPeople(): Promise<Identity[]> {
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

/**
 * Who a rights list may name: everyone of the wiki, people and groups alike.
 * Unguarded on purpose, unlike the rest of this module — its callers check
 * first that the person may pose rights on something. A page's owner is not an
 * administrator and still has to be able to name whoever they open it to.
 */
export async function listDirectory(): Promise<AclDirectory> {
  const [people, groups] = await Promise.all([
    listPeople(),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  return { people, groups };
}

/**
 * Which of these names still exist, so that a right copied from the
 * configuration cannot grant anything to an account or a group that has gone
 * (ADR 0026). Names nothing, asks nothing: the empty case is the one a wiki
 * runs in, and it costs no query.
 */
export async function existingPrincipals(names: {
  usernames: readonly string[];
  groupSlugs: readonly string[];
}): Promise<{ usernames: Set<string>; groupSlugs: Set<string> }> {
  const [users, groups] = await Promise.all([
    names.usernames.length === 0
      ? []
      : prisma.user.findMany({
          where: { username: { in: [...names.usernames] } },
          select: { username: true },
        }),
    names.groupSlugs.length === 0
      ? []
      : prisma.group.findMany({
          where: { slug: { in: [...names.groupSlugs] } },
          select: { slug: true },
        }),
  ]);
  return {
    usernames: new Set(users.flatMap((user) => (user.username ? [user.username] : []))),
    groupSlugs: new Set(groups.map((group) => group.slug)),
  };
}

/**
 * The display names of these groups, alphabetically. What a refusal names
 * itself for — « Réservé à @Bureau » — where the rule holds a slug, which
 * says nothing to whoever is being turned away.
 */
export async function groupDisplayNames(
  slugs: readonly string[]
): Promise<string[]> {
  if (slugs.length === 0) return [];
  const groups = await prisma.group.findMany({
    where: { slug: { in: [...slugs] } },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return groups.map((group) => group.name);
}

/**
 * The same names, kept beside the slugs that asked for them: a system page wording
 * several rules at once — the fields of a form, each with its own — has to put
 * each name back where it came from, which an alphabetical list cannot do.
 */
export async function groupNamesBySlug(
  slugs: readonly string[]
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  return groupNames(
    await prisma.group.findMany({
      where: { slug: { in: [...new Set(slugs)] } },
      select: { slug: true, name: true },
    })
  );
}

/** A group's display name from its slug, for the paths system pages print. */
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
export interface InheritedPerson extends Identity {
  path: NamedGroup[];
}

export interface GroupDetail {
  slug: string;
  name: string;
  protected: boolean;
  /** Removable: they were put there by hand. */
  people: Identity[];
  /** Nested groups, also removable — never any for @Admins. */
  groups: NamedGroup[];
  /** Observed, not editable: to remove them, edit the group they are in. */
  inherited: InheritedPerson[];
  /** Direct and inherited people together, counted once each. */
  peopleCount: number;
  /** Groups this one may still take in: itself excluded, members excluded. */
  addableGroups: NamedGroup[];
  /** People it may still take in. */
  addablePeople: Identity[];
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

/** Turns the slug paths of the pure module into what a system page can print. */
function namePeople(
  members: InheritedMember[],
  people: Identity[],
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
 * service just made (ADR 0027). Idempotent, so a retried installation
 * converges instead of failing halfway — and person-free, since it runs
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

/**
 * Who administers the wiki, directly — nesting never makes an administrator
 * (docs/permissions.md § Groupes), so this list is the whole answer. Read by
 * modules/accounts/queries/queries.ts before it disables or erases anyone: the memberships are
 * this door's, whoever asks.
 */
export async function listAdminUsernames(): Promise<string[]> {
  const members = await prisma.groupMember.findMany({
    where: { groupSlug: ADMINS_GROUP.slug, username: { not: null } },
    select: { username: true },
  });
  return members.map((member) => member.username!);
}

/**
 * The membership an accepted invitation carries out. No administrator is
 * acting — the person joining is nobody's — and what allows it is the
 * invitation that named the group, back when one did have the say.
 */
export async function joinGroupOnInvitation(
  groupSlug: string,
  username: string
): Promise<void> {
  await prisma.groupMember.upsert({
    where: { groupSlug_username: { groupSlug, username } },
    create: { groupSlug, username },
    update: {},
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

/**
 * Deletes the group, and with it every membership and right naming it
 * (`onDelete: Cascade`, ADR 0024). The field rights and form defaults naming
 * this slug live in `Form.schema` on the other hand, which no foreign key
 * reaches, so the sweep runs here, in the same transaction, rather than
 * trusting Postgres to have done it.
 */
export async function deleteGroupBySlug(slug: string): Promise<void> {
  await assertAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.group.delete({ where: { slug } });
    await sweepAclReferences(tx, { kind: "groupSlug", from: slug, to: null });
  });
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
