// The nesting of groups (docs/permissions.md § Groupes): pure graph work on
// plain edges, no I/O — lib/groups-db.ts loads them and writes the results
// back, the pairing this project uses throughout (slug-rename, field-rename,
// entry-title).
//
// A group holds people and/or other groups with no depth limit, so three
// questions follow from one graph: which groups a person ends up in, which
// membership would close a cycle, and by which path someone lands in a group
// they were never added to.

import { plural } from "./format";
import { ADMINS_GROUP, LAST_ADMIN_REFUSAL } from "./permissions";

/** One nesting: `groupSlug` holds `memberGroupSlug` among its members. */
export interface Nesting {
  groupSlug: string;
  memberGroupSlug: string;
}

/** One person put in a group by hand. */
export interface Membership {
  groupSlug: string;
  username: string;
}

/**
 * Someone a group holds without anyone having put them there, and the way
 * they come in by — groups from the direct nested member down to the one
 * they were actually added to.
 */
export interface InheritedMember {
  username: string;
  path: string[];
}

/** A group joined by nesting, and the way up to it from a direct one. */
export interface InheritedGroup {
  slug: string;
  path: string[];
}

/**
 * What a membership names, as the table holds it: a person or a group, never
 * both. One shape from the screen to the door, so nothing translates it on
 * the way.
 */
export type MemberRef = { username: string } | { groupSlug: string };

// Which of the two it is, asked once here rather than by every caller that
// has to write the pair into a row or key a map by it — the same shape reaches
// the ACL table, the rights lists and the counts of an action by lot.

export function refUsername(ref: MemberRef): string | null {
  return "username" in ref ? ref.username : null;
}

export function refGroupSlug(ref: MemberRef): string | null {
  return "groupSlug" in ref ? ref.groupSlug : null;
}

/**
 * Every group the person counts as a member of: the ones they were added to,
 * plus every group holding those, at any depth. Sorted, so a caller comparing
 * two resolutions never sees a difference that traversal order invented.
 */
export function effectiveGroups(
  nestings: readonly Nesting[],
  directGroupSlugs: readonly string[]
): string[] {
  const holders = holdersByMemberGroup(nestings);
  const reached = new Set(directGroupSlugs);
  const pending = [...reached];
  while (pending.length > 0) {
    const slug = pending.pop()!;
    for (const holder of holders.get(slug) ?? []) {
      if (reached.has(holder)) continue;
      reached.add(holder);
      pending.push(holder);
    }
  }
  return [...reached].sort();
}

/** The nestings read upwards: which groups hold this one. */
function holdersByMemberGroup(
  nestings: readonly Nesting[]
): Map<string, string[]> {
  return adjacency(nestings, (nesting) => [
    nesting.memberGroupSlug,
    nesting.groupSlug,
  ]);
}

/** And downwards: which groups this one holds. */
function heldByGroup(nestings: readonly Nesting[]): Map<string, string[]> {
  return adjacency(nestings, (nesting) => [
    nesting.groupSlug,
    nesting.memberGroupSlug,
  ]);
}

function adjacency(
  nestings: readonly Nesting[],
  edge: (nesting: Nesting) => [from: string, to: string]
): Map<string, string[]> {
  const links = new Map<string, string[]>();
  for (const nesting of nestings) {
    const [from, to] = edge(nesting);
    const known = links.get(from);
    if (known) known.push(to);
    else links.set(from, [to]);
  }
  return links;
}

/**
 * The people `groupSlug` ends up holding through its nested groups, each with
 * the way they come in by. Someone also added directly is left out: they show
 * up once, as a chip that can be removed — a second, read-only line would
 * only invite the question of which of the two is the real one.
 */
export function inheritedMembers(
  nestings: readonly Nesting[],
  memberships: readonly Membership[],
  groupSlug: string
): InheritedMember[] {
  const paths = nestedGroupPaths(nestings, groupSlug);
  const direct = new Set(
    memberships
      .filter((membership) => membership.groupSlug === groupSlug)
      .map((membership) => membership.username)
  );

  const shortest = new Map<string, string[]>();
  for (const membership of memberships) {
    if (direct.has(membership.username)) continue;
    const path = paths.get(membership.groupSlug);
    if (!path) continue;
    const known = shortest.get(membership.username);
    if (!known || path.length < known.length) {
      shortest.set(membership.username, path);
    }
  }
  return [...shortest]
    .map(([username, path]) => ({ username, path }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

/**
 * The other way round, for a person's line: the groups they are in without
 * having been added to them, nearest first, each with the way up to it. This
 * is where one usually looks for *why* someone has access.
 */
export function inheritedGroups(
  nestings: readonly Nesting[],
  directGroupSlugs: readonly string[]
): InheritedGroup[] {
  const holders = holdersByMemberGroup(nestings);
  const inherited: InheritedGroup[] = [];
  const seen = new Set(directGroupSlugs);

  // A front of ways down: each starts at the group being left and ends at the
  // direct group the person actually belongs to.
  let front = directGroupSlugs.map((slug) => [slug]);
  while (front.length > 0) {
    const next: string[][] = [];
    for (const path of front) {
      for (const holder of holders.get(path[0]) ?? []) {
        if (seen.has(holder)) continue;
        seen.add(holder);
        inherited.push({ slug: holder, path });
        next.push([holder, ...path]);
      }
    }
    front = next;
  }
  return inherited;
}

/** Between two groups of a way down, as every screen writes it. */
export const PATH_SEPARATOR = " › ";

/** A group, as every message writes it: its name behind an @. */
function groupLabel(name: string): string {
  return `@${name}`;
}

/**
 * @Admins takes people only, and its selector simply does not offer groups —
 * the state is made impossible rather than caught: no error message ever
 * explains a nesting that was never proposed.
 */
export function acceptsNestedGroups(groupSlug: string): boolean {
  return groupSlug !== ADMINS_GROUP.slug;
}

/** The note beside that selector, so its absence is never a mystery. */
export const PEOPLE_ONLY_NOTE =
  "Ce groupe n'accepte que des personnes — on ne devient pas administrateur en étant membre d'un autre groupe.";

/** Protected like a special page: renaming and deleting are not offered. */
export function isProtectedGroup(slug: string): boolean {
  return slug === ADMINS_GROUP.slug;
}

// The name of the protected group is the constant, never a stored value: it
// is protected against renaming, so what the installation gave it is what it
// still reads.
const PROTECTED_GROUP = groupLabel(ADMINS_GROUP.name);

/**
 * Why this group refuses to be renamed, or null when it may be. The refusal
 * names the group: a screen shows several at a time, and « ce groupe » would
 * leave the reader to work out which one answered.
 */
export function groupRenameRefusal(slug: string): string | null {
  if (!isProtectedGroup(slug)) return null;
  return `Le groupe ${PROTECTED_GROUP} ne peut pas être renommé.`;
}

/** And why it refuses to be deleted. */
export function groupDeletionRefusal(slug: string): string | null {
  if (!isProtectedGroup(slug)) return null;
  return `Le groupe ${PROTECTED_GROUP} ne peut pas être supprimé.`;
}

/**
 * What deleting this group would take away, when it would take anything: the
 * rights naming it go with it, by `onDelete: Cascade` (ADR 0024). The
 * confirmation says the number, because « supprimer un groupe » does not read
 * as « fermer 23 pages » until someone writes it down.
 */
export function groupDeletionImpact(
  name: string,
  pageCount: number
): string | null {
  if (pageCount === 0) return null;
  return `${groupLabel(name)} apparaît dans les droits de ${plural(pageCount, "page", "pages")}. Le supprimer retirera ces droits.`;
}

/**
 * Why this member cannot be taken out, or null when they may go. Only
 * @Admins ever refuses: a wiki whose administrators' group is empty is one
 * nobody can take back — the installation screen is a one-way door (ADR
 * 0027), so it will not hand it over a second time.
 */
export function memberRemovalRefusal(group: {
  groupSlug: string;
  memberCount: number;
}): string | null {
  if (group.groupSlug !== ADMINS_GROUP.slug || group.memberCount > 1) {
    return null;
  }
  return LAST_ADMIN_REFUSAL;
}

/**
 * What the toast says once a direct membership is gone but the nesting keeps
 * the person in. The removal did happen — this is not a refusal, it is the
 * screen refusing to let the chip's disappearance say more than it means.
 */
export function stillMemberMessage(
  name: string,
  pathNames: readonly string[]
): string {
  const path = pathNames.map(groupLabel).join(PATH_SEPARATOR);
  return `${name} reste membre via ${path}.`;
}

/**
 * The way back a nesting would close, or null when it closes none: the chain
 * from the candidate member down to the group about to hold it, both ends
 * included. A cycle is refused at save time, and what makes the refusal
 * actionable is naming that chain rather than announcing a verdict.
 */
export function nestingCycle(
  nestings: readonly Nesting[],
  candidate: Nesting
): string[] | null {
  const { groupSlug, memberGroupSlug } = candidate;
  if (groupSlug === memberGroupSlug) return [groupSlug];
  const wayBack = nestedGroupPaths(nestings, memberGroupSlug).get(groupSlug);
  return wayBack ? [memberGroupSlug, ...wayBack] : null;
}

/**
 * The refusal, in the words of the spec: « @Rédacteurs contient déjà @Bureau,
 * via @Trésorerie. » Takes display names, already read off the way back —
 * naming groups by their slug would be right and unreadable.
 */
export function nestingCycleMessage(names: readonly string[]): string {
  const [holder, ...rest] = names;
  if (rest.length === 0) {
    return `${groupLabel(holder)} ne peut pas se contenir lui-même.`;
  }
  const held = rest[rest.length - 1];
  const between = rest.slice(0, -1);
  const via =
    between.length === 0
      ? ""
      : `, via ${between.map(groupLabel).join(PATH_SEPARATOR)}`;
  return `${groupLabel(holder)} contient déjà ${groupLabel(held)}${via}.`;
}

/**
 * For each group held below `groupSlug`, the way down to it — what the group
 * editor reads aloud as « via @Bureau › @Trésorerie », and what tells someone
 * why they belong to a group they were never added to.
 *
 * Breadth first, so the way shown is the shortest one; a group reached twice
 * keeps the first. A cycle cannot be saved, but one already in the database
 * must not hang the screen that would let an administrator undo it.
 */
export function nestedGroupPaths(
  nestings: readonly Nesting[],
  groupSlug: string
): Map<string, string[]> {
  const held = heldByGroup(nestings);
  const paths = new Map<string, string[]>();
  let front = [groupSlug];
  while (front.length > 0) {
    const next: string[] = [];
    for (const slug of front) {
      const path = paths.get(slug) ?? [];
      for (const nested of held.get(slug) ?? []) {
        if (nested === groupSlug || paths.has(nested)) continue;
        paths.set(nested, [...path, nested]);
        next.push(nested);
      }
    }
    front = next;
  }
  return paths;
}
