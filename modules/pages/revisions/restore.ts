import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseFormDescriptor, readEntryData } from "@/modules/forms/form-descriptor";
import { restoredEntryValues } from "@/modules/forms/entry-title";
import { mergedEntryData } from "@/modules/permissions/field-level";
import { currentPerson, currentUsername } from "@/modules/permissions/person";
import { REFUSALS } from "@/modules/permissions/rules";
import { assertCanWrite, ifReadable, mintRevision } from "../access/guards";
import { WITH_RIGHTS, isRefused } from "../rights";

// A restore appends a revision (ADR 0003/0009). The current form and field
// rights decide what the snapshot can put back; the title and its notice
// must both describe that final merge, never the unfiltered archive.
export async function restoreArchivedRevision(revisionId: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.revision.findUnique({
      where: { id: revisionId },
      include: { page: { include: { current: true, form: true, ...WITH_RIGHTS } } },
    });
    if (!source) return { error: "Révision introuvable." };
    const page = source.page;
    if (isRefused(await ifReadable(page))) return { error: REFUSALS.access };
    await assertCanWrite(page);

    let data = source.data === null ? undefined : source.data as Prisma.InputJsonValue;
    let titleKept = false;
    const descriptor = page.form ? parseFormDescriptor(page.form.schema).descriptor : null;
    if (descriptor && data !== undefined) {
      const restored = restoredEntryValues(
        descriptor,
        mergedEntryData(
          await currentPerson(),
          descriptor,
          readEntryData(page.current?.data),
          readEntryData(source.data)
        )
      );
      data = restored.values as Prisma.InputJsonValue;
      titleKept = restored.titleKept;
    }
    await mintRevision(tx, {
      pageId: page.id,
      content: source.content,
      data,
      authorUsername: await currentUsername(),
      restoredFromId: source.id,
    });
    return { slug: page.slug, titleKept };
  });
}
