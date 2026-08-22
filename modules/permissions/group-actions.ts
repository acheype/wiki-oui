"use server";

// Server Actions of the group system page (docs/permissions.md § Groupes): the
// admin components are client-side and read their data through actions too,
// the same transport as mutations (ADR 0014). Every one of them is an
// administrator's action — the check lives behind the door, in
// modules/permissions/groups-queries.ts, so none of these can forget it.

import {
  type MemberRef,
  groupDeletionRefusal,
  groupRenameRefusal,
} from "@/modules/permissions/groups";
import {
  type GroupDetail,
  type GroupSummary,
  addPersonToGroup,
  deleteGroupBySlug,
  getGroupDetail,
  groupExists,
  insertGroup,
  listGroupSummaries,
  nestGroup,
  removeGroupMember,
  updateGroupName,
} from "@/modules/permissions/groups-queries";
import { countPagesGrantingGroup } from "@/modules/pages/rights";
import { isValidSlug } from "@/lib/slug";

export type GroupError = { error: string };

export async function listGroups(): Promise<GroupSummary[]> {
  return listGroupSummaries();
}

/**
 * A group's editor also says what deleting it would take with it: how many
 * pages carry a right naming it (docs/permissions.md § Les pages système). Counted
 * here rather than in modules/permissions/groups-queries.ts, because it is a question about pages
 * — and pages answer through their own door (ADR 0025).
 */
export interface GroupDetailWithRights extends GroupDetail {
  pagesGranting: number;
}

export async function getGroup(
  slug: string
): Promise<GroupDetailWithRights | null> {
  // getGroupDetail refuses anyone but an administrator, and it runs first.
  const detail = await getGroupDetail(slug);
  if (!detail) return null;
  return { ...detail, pagesGranting: await countPagesGrantingGroup(slug) };
}

/**
 * A group takes its name and, once, its identifier — derived from the name,
 * personalisable before saving, then frozen: the fixed-identity rule the
 * whole project follows (docs/forms.md § Identités). The identifier is what
 * the rights store (ADR 0024), so a collision is answered by asking for
 * another, never by a silent suffix.
 */
export async function createGroup(group: {
  name: string;
  slug: string;
}): Promise<GroupError | { slug: string }> {
  const name = group.name.trim();
  if (name === "") {
    return { error: "Le nom du groupe est obligatoire." };
  }
  if (!isValidSlug(group.slug)) {
    return {
      error: `Identifiant invalide : «\u00A0${group.slug}\u00A0» (minuscules, chiffres et tirets).`,
    };
  }
  if (await groupExists(group.slug)) {
    return {
      error: `Un groupe porte déjà l'identifiant «\u00A0${group.slug}\u00A0».`,
    };
  }
  await insertGroup({ slug: group.slug, name });
  return { slug: group.slug };
}

export async function renameGroup(
  slug: string,
  name: string
): Promise<GroupError | void> {
  const protectedRefusal = groupRenameRefusal(slug);
  if (protectedRefusal) {
    return { error: protectedRefusal };
  }
  if (name.trim() === "") {
    return { error: "Le nom du groupe est obligatoire." };
  }
  await updateGroupName(slug, name.trim());
}

export async function deleteGroup(slug: string): Promise<GroupError | void> {
  const protectedRefusal = groupDeletionRefusal(slug);
  if (protectedRefusal) {
    return { error: protectedRefusal };
  }
  await deleteGroupBySlug(slug);
}

export async function addMember(
  groupSlug: string,
  member: MemberRef
): Promise<GroupError | void> {
  if ("username" in member) {
    await addPersonToGroup(groupSlug, member.username);
    return;
  }
  const refusal = await nestGroup(groupSlug, member.groupSlug);
  if (refusal) return { error: refusal };
}

export async function removeMember(
  groupSlug: string,
  member: MemberRef
): Promise<GroupError | void> {
  const refusal = await removeGroupMember(groupSlug, member);
  if (refusal) return { error: refusal };
}
