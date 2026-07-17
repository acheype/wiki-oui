import { Prisma } from "./generated/prisma/client";
import { type FieldRenameMapping, renameDataKeys } from "./field-rename";
import { readEntryData } from "./form-descriptor";

// The database side of a field-identifier rename (ADR 0017): runs inside the
// saveForm transaction, after the schema overwrite. Same shape as the slug
// sweep (lib/slug-rename-db): a LIKE prefilter narrows the candidates, the
// pure engine gives the precise answer.

// Works both inside a transaction and on the bare client.
type Db = Prisma.TransactionClient;

/**
 * How many of the form's entries carry the field key in their current
 * snapshot — the rename dialog's headcount. A rename sweeps all of history,
 * but the numbers an admin reasons about are the live ones.
 */
export async function countFieldCarriers(
  db: Db,
  formId: string,
  fieldName: string
): Promise<number> {
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS "count"
    FROM "Page" p JOIN "Revision" r ON r."id" = p."currentRevisionId"
    WHERE p."formId" = ${formId}::uuid AND jsonb_exists(r."data", ${fieldName})`;
  return count;
}

/**
 * The retcon itself: renames the mapped keys in every revision of the form's
 * entries (history included, no revision minted), each snapshot rewritten in
 * one pass so crossed swaps stay correct.
 */
export async function sweepFieldRenames(
  tx: Db,
  formId: string,
  mapping: FieldRenameMapping
): Promise<void> {
  if (mapping.size === 0) return;
  const likes = [...mapping.keys()].map(
    // A JSON key is always quoted in the serialized text: `"key"`.
    (from) => Prisma.sql`r."data"::text LIKE ${`%"${from}"%`}`
  );
  const revisions = await tx.$queryRaw<{ id: string; data: unknown }[]>(
    Prisma.sql`
      SELECT r."id", r."data"
      FROM "Revision" r JOIN "Page" p ON p."id" = r."pageId"
      WHERE p."formId" = ${formId}::uuid AND (${Prisma.join(likes, " OR ")})`
  );
  for (const revision of revisions) {
    const data = renameDataKeys(readEntryData(revision.data), mapping);
    if (data !== null) {
      await tx.revision.update({
        where: { id: revision.id },
        data: { data: data as object },
      });
    }
  }
}
