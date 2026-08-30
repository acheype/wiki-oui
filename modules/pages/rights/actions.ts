"use server";

import { revalidatePath } from "next/cache";
import { listDirectory } from "@/modules/permissions/groups-directory";
import {
  type PageRightsView,
  getPageRights,
  setPageRights,
  transferPageOwnership,
} from "@/modules/pages/access/page-rights";
import {
  type AccessRule,
  type AclDirectory,
  refusalMessage,
} from "@/modules/permissions/rules";

// The « Accès » modal's three calls. Posing rights is a mutation, so it opens
// from the action bar rather than from a /{slug}/droits handler — the same
// choice « Changer l'adresse » made (docs/permissions.md § La modale de
// droits d'une page). Handing the page on is the third: it stops at the same
// rung, and it is where the modal already names the owner. All three go
// through modules/pages/access/guards.ts, which refuses anyone but the owner and
// the administrators (ADR 0025).

export interface PageRightsForm extends PageRightsView {
  /** Who the two lists — and the transfer — may name. */
  directory: AclDirectory;
}

/**
 * The refusal travels as a value rather than as a throw: across the Server
 * Action boundary a throw becomes a render error, which would leave the modal
 * on « Chargement… » for good — exactly when a right had just gone away.
 * `rights: null` is the other ending, a page deleted since the bar was drawn.
 */
export type PageRightsLoad =
  | { error: string }
  | { rights: PageRightsForm | null };

export async function loadPageRights(slug: string): Promise<PageRightsLoad> {
  try {
    const rights = await getPageRights(slug);
    if (!rights) return { rights: null };
    // Read after the check above, never before: the directory is the whole
    // membership of the wiki, and only someone entitled to pose a right has
    // any business seeing it.
    return { rights: { ...rights, directory: await listDirectory() } };
  } catch (error) {
    return { error: refusalMessage(error) };
  }
}

export async function savePageRights(
  slug: string,
  read: AccessRule,
  write: AccessRule
): Promise<{ error: string } | void> {
  try {
    await setPageRights(slug, read, write);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  // A page whose read scope just closed must disappear from the menus and the
  // lists of whoever no longer sees it: the whole tree, like a save.
  revalidatePath("/", "layout");
}

/**
 * « Transmettre la propriété » (docs/permissions.md): sans retour pour celui
 * qui donne, and the modal warns before the click. No redirect afterwards —
 * whoever gave the page away may have just lost the right to what they are
 * looking at, and the page they land back on says so on its own.
 */
export async function transferOwnership(
  slug: string,
  toUsername: string
): Promise<{ error: string } | void> {
  try {
    await transferPageOwnership(slug, toUsername);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  revalidatePath("/", "layout");
}
