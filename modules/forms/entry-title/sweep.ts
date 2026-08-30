// The database side of a stored-title recompute (ADR 0020): runs inside the
// saveForm transaction, after the schema overwrite. Unlike the field-rename
// sweep (modules/forms/field-rename/sweep.ts), it touches only the *current* revision of each
// entry, and by minting a new one — a recompute changes what the entry
// *says*, so rewriting history in place would falsify it, where a rename only
// retouches the representation and must reach history to keep it legible.

import {
  type EntryData,
  type FormDescriptor,
  computeAutomaticTitle,
  readEntryData,
  withTitleOrdered,
} from "@/modules/forms/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";

type Db = Prisma.TransactionClient;

export interface TitleRecomputeImpact {
  /** Entries whose stored title actually changes. */
  updated: number;
  /** Entries the template computes to empty for: skipped, title untouched. */
  skipped: number;
}

interface TitleChange {
  pageId: string;
  data: EntryData;
}

/**
 * What the recompute would do, without doing it: the confirmation's numbers
 * and the sweep's worklist come from the same pass, so they can never
 * disagree. An entry whose title is unchanged yields nothing — saving
 * identical content writes no revision (docs/architecture.md).
 */
async function planTitleRecompute(
  db: Db,
  formId: string,
  descriptor: FormDescriptor
): Promise<{ changes: TitleChange[]; skipped: number }> {
  const pages = await db.page.findMany({
    where: { formId },
    include: { current: true },
  });
  const changes: TitleChange[] = [];
  let skipped = 0;
  for (const page of pages) {
    if (!page.current) continue;
    const data = readEntryData(page.current.data);
    const title = computeAutomaticTitle(descriptor, data);
    // A fiche always carries a non-empty title: where the template computes
    // to nothing, the entry keeps the one it has and the admin is told.
    if (title.trim() === "") {
      skipped++;
      continue;
    }
    if (title === data.title) continue;
    changes.push({
      pageId: page.id,
      data: withTitleOrdered(descriptor, data, title),
    });
  }
  return { changes, skipped };
}

/** The confirmation's headcount, computed against the candidate descriptor. */
export async function countTitleRecompute(
  db: Db,
  formId: string,
  descriptor: FormDescriptor
): Promise<TitleRecomputeImpact> {
  const { changes, skipped } = await planTitleRecompute(db, formId, descriptor);
  return { updated: changes.length, skipped };
}

/**
 * The recompute itself: a new revision per entry whose title changes, so the
 * history stays append-only (ADR 0003) and no hand-typed title is destroyed.
 */
export async function sweepEntryTitles(
  db: Db,
  formId: string,
  descriptor: FormDescriptor,
  authorUsername: string | null
): Promise<TitleRecomputeImpact> {
  const { changes, skipped } = await planTitleRecompute(db, formId, descriptor);
  for (const change of changes) {
    const revision = await db.revision.create({
      data: {
        pageId: change.pageId,
        data: change.data as Prisma.InputJsonValue,
        authorUsername,
      },
    });
    await db.page.update({
      where: { id: change.pageId },
      data: { currentRevisionId: revision.id },
    });
  }
  return { updated: changes.length, skipped };
}
