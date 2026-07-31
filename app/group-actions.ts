"use server";

// Server Actions of the group screen (docs/permissions.md § Groupes): the
// admin components are client-side and read their data through actions too,
// the same transport as mutations (ADR 0014). Every one of them is an
// administrator's gesture — the check lives behind the door, in
// lib/groups-db.ts, so none of these can forget it.

import { isProtectedGroup } from "@/lib/groups";
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
} from "@/lib/groups-db";
import { isValidSlug } from "@/lib/slug";

export type GroupError = { error: string };

export async function listGroups(): Promise<GroupSummary[]> {
  return listGroupSummaries();
}

export async function getGroup(slug: string): Promise<GroupDetail | null> {
  return getGroupDetail(slug);
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
      error: `Identifiant invalide : « ${group.slug} » (minuscules, chiffres et tirets).`,
    };
  }
  if (await groupExists(group.slug)) {
    return {
      error: `Un groupe porte déjà l'identifiant « ${group.slug} ».`,
    };
  }
  await insertGroup({ slug: group.slug, name });
  return { slug: group.slug };
}

export async function renameGroup(
  slug: string,
  name: string
): Promise<GroupError | void> {
  if (isProtectedGroup(slug)) {
    return { error: "Ce groupe ne peut pas être renommé." };
  }
  if (name.trim() === "") {
    return { error: "Le nom du groupe est obligatoire." };
  }
  await updateGroupName(slug, name.trim());
}

export async function deleteGroup(slug: string): Promise<GroupError | void> {
  if (isProtectedGroup(slug)) {
    return { error: "Ce groupe ne peut pas être supprimé." };
  }
  await deleteGroupBySlug(slug);
}

/** A member is a person or a group, exactly as the table holds it. */
export type MemberRef = { username: string } | { groupSlug: string };

export async function addMember(
  groupSlug: string,
  member: MemberRef
): Promise<GroupError | void> {
  const refusal =
    "username" in member
      ? await addPersonToGroup(groupSlug, member.username)
      : await nestGroup(groupSlug, member.groupSlug);
  if (refusal) return { error: refusal };
}

export async function removeMember(
  groupSlug: string,
  member: MemberRef
): Promise<GroupError | void> {
  const refusal = await removeGroupMember(
    groupSlug,
    "username" in member
      ? { username: member.username }
      : { memberGroupSlug: member.groupSlug }
  );
  if (refusal) return { error: refusal };
}
