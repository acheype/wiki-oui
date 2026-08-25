import { restoredEntryValues } from "@/modules/forms/entry-title";
import { mergedEntryData } from "@/modules/permissions/field-level";
import { type EntryData, type FormDescriptor, readEntryData } from "@/modules/forms/form-descriptor";
import type { Prisma } from "@/lib/generated/prisma/client";
import { currentPerson, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import { assertCanWrite, ifReadable, mintRevision } from "@/modules/pages/access/guards";
import { PUBLIC_IDENTITY, WITH_RIGHTS, isRefused } from "@/modules/pages/rights";

// A page's history: reading it, reading one revision to restore, writing a
// restored one back. Part of ADR 0025's door, alongside modules/pages/content.ts,
// modules/pages/rights.ts and modules/pages/entries.ts.

export async function getPageWithRevisions(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      ...WITH_RIGHTS,
      revisions: {
        orderBy: { createdAt: "asc" },
        include: {
          author: PUBLIC_IDENTITY,
          restoredFrom: { select: { id: true, createdAt: true } },
        },
      },
    },
  });
  return page && ifReadable(page);
}

/** The source of a restore, with what tells how to read its snapshot. */
export async function getRevisionToRestore(revisionId: string) {
  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { page: { include: { form: true, ...WITH_RIGHTS } } },
  });
  if (!revision) return null;
  const page = await ifReadable(revision.page);
  return isRefused(page) ? page : revision;
}

/**
 * A restore is a NEW revision labeled with its origin (ADR 0003/0009):
 * history stays append-only, nothing is rewound. Both snapshot columns are
 * carried over, which preserves the content-xor-data invariant (ADR 0014) for
 * MDX pages and entries alike.
 *
 * An entry's snapshot goes through the same merge a save does: putting an old
 * revision back is a write like any other, and the fields this person may not
 * write keep the values they hold today. Without it, restoring would be the
 * way round the merge — and a silent one, the restorer never having seen on
 * screen what they were putting back (docs/permissions.md § Champ).
 */
export async function writeRestoredRevision(input: {
  pageId: string;
  content: string | null;
  data: Prisma.InputJsonValue | undefined;
  restoredFromId: string;
  /** The form's fields for an entry; null for an MDX page, which has none. */
  descriptor: FormDescriptor | null;
}): Promise<void> {
  const { pageId, content, data, restoredFromId, descriptor } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true, ...WITH_RIGHTS },
  });
  await assertCanWrite(page);
  const restored =
    descriptor && data !== undefined
      ? (restoredEntryValues(
          descriptor,
          mergedEntryData(
            await currentPerson(),
            descriptor,
            readEntryData(page.current?.data),
            data as EntryData
          )
          // The title is worked out again, after the merge and not before it:
          // the caller computed one from the archived snapshot, and a field
          // the restorer may not write is not going back to what that title
          // names. Stored titles are never recomputed at read (ADR 0020), so
          // a title left naming values the fiche does not hold would stay
          // wrong for good.
        ).values as Prisma.InputJsonValue)
      : data;
  const author = await currentUsername();
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      content,
      data: restored,
      authorUsername: author,
      restoredFromId,
    });
  });
}
