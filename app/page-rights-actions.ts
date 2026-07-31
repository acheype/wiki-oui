"use server";

import { revalidatePath } from "next/cache";
import { listDirectory } from "@/lib/groups-db";
import {
  type PageRightsView,
  getPageRights,
  setPageRights,
} from "@/lib/pages";
import type { AccessRule } from "@/lib/permissions";

// The « Droits » modal's two calls. Posing rights is a mutation, so it opens
// from the action bar rather than from a /{slug}/droits handler — the same
// choice « Changer l'adresse » made (docs/permissions.md § La modale de
// droits d'une page). Both calls go through lib/pages.ts, which refuses
// anyone but the owner and the administrators (ADR 0025).

export interface PageRightsForm extends PageRightsView {
  /** Who the two lists may name. */
  directory: {
    people: { username: string; name: string }[];
    groups: { slug: string; name: string }[];
  };
}

export async function loadPageRights(
  slug: string
): Promise<PageRightsForm | null> {
  const rights = await getPageRights(slug);
  if (!rights) return null;
  // Read after the check above, never before: the directory is the whole
  // membership of the wiki, and only someone entitled to pose a right has
  // any business seeing it.
  return { ...rights, directory: await listDirectory() };
}

export async function savePageRights(
  slug: string,
  read: AccessRule,
  write: AccessRule
): Promise<{ error: string } | void> {
  try {
    await setPageRights(slug, read, write);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Échec de l'enregistrement." };
  }
  // A page whose read scope just closed must disappear from the menus and the
  // lists of whoever no longer sees it: the whole tree, like a save.
  revalidatePath("/", "layout");
}
