"use server";

import { revalidatePath } from "next/cache";
import type {
  AccessGrant,
  GrantTarget,
  RightsReplacement,
} from "@/modules/permissions/bulk";
import type { MemberRef } from "@/modules/permissions/groups-nesting";
import { grantTarget, listDirectory } from "@/modules/permissions/groups-directory";
import {
  type ManagedPage,
  grantPagesAccess,
  handPagesTo,
  listManagedPages,
  replacePagesRights,
} from "@/modules/pages/access/admin-rights";
import { type AclDirectory, refusalMessage } from "@/modules/permissions/rules";

// Server Actions of `gerer-pages` (docs/permissions.md § Les pages système). Reading
// the list and acting on a lot are both an administrator's permissions, and the
// check lives behind the guards in modules/pages/access/guards.ts, so none of these
// can forget it.
//
// Refusals travel as values rather than as throws: across the Server Action
// boundary a throw becomes a render error, where a right that went away
// between opening the system page and acting reads as a crash.

export type PagesAdminError = { error: string };

/**
 * What the system page draws itself from. The directory rides along because the
 * list needs it to read a rule back — a « seulement » holds usernames and
 * group slugs (ADR 0024), and a column showing those would be unreadable.
 */
export interface PagesAdminData {
  pages: ManagedPage[];
  directory: AclDirectory;
}

export async function loadManagedPages(): Promise<PagesAdminData> {
  const pages = await listManagedPages();
  // Read after the list, never before: the directory is the whole membership
  // of the wiki, and only someone the guard just let through has any business
  // seeing it.
  return { pages, directory: await listDirectory() };
}

/**
 * A principal as the count reads them, resolved server-side: which groups
 * reach them decides what « y donne déjà accès » means, and the browser has no
 * way of knowing the nesting.
 */
export async function describeGrantTarget(
  ref: MemberRef
): Promise<GrantTarget | null> {
  return grantTarget(ref);
}

export async function giveAccess(
  slugs: string[],
  grant: AccessGrant
): Promise<PagesAdminError | void> {
  try {
    await grantPagesAccess(slugs, grant);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  revalidatePath("/", "layout");
}

export async function replaceRights(
  slugs: string[],
  replacement: RightsReplacement
): Promise<PagesAdminError | void> {
  try {
    await replacePagesRights(slugs, replacement);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  // Pages whose read scope just closed have to leave the menus and the lists
  // of whoever no longer sees them: the whole tree, like a save.
  revalidatePath("/", "layout");
}

export async function handPagesOver(
  slugs: string[],
  toUsername: string
): Promise<PagesAdminError | void> {
  try {
    await handPagesTo(slugs, toUsername);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  revalidatePath("/", "layout");
}
