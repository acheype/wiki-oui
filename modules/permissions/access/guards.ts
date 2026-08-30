import { sweepAclReferences } from "@/modules/permissions/acl-rename-sweep";
import {
  type MemberRef,
  acceptsNestedGroups,
  memberRemovalRefusal,
  nestingCycle,
  nestingCycleMessage,
} from "@/modules/permissions/groups-nesting";
import { type NamedGroup, groupNames, listNestings } from "@/modules/permissions/groups-directory";
import { assertAdmin } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// The admin mutations of the group system page (docs/permissions.md § Groupes):
// every action that changes a group passes through here, and every one of them
// is an administrator's — v0.5 gives group edition to nobody else, so the
// check lives in this access layer rather than in each caller (ADR 0025).
// Private to modules/permissions/ by its depth (ADR 0029).

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
