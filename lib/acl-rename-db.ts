import { type PrincipalChange, rewriteDescriptorRights } from "./acl-rename";
import type { Prisma } from "./generated/prisma/client";
import { parseFormDescriptor } from "./form-descriptor";

// The database side of the sweep ADR 0024 calls for, shaped like
// field-rename-db.ts and slug-rename-db.ts (a LIKE prefilter narrows the
// candidates, the pure engine gives the precise answer). Runs inside the
// caller's transaction — right where the account or the group action itself
// writes (lib/accounts-db.ts, lib/groups-db.ts) — so a rename or an erasure
// never leaves a form's rights momentarily out of step with the accounts and
// groups that still exist.

// Works both inside a transaction and on the bare client.
type Db = Prisma.TransactionClient;

/**
 * Rewrites every form naming this principal in its field rights or its own
 * defaults — the one place ADR 0024 says no foreign key reaches. A principal
 * absent from every `Form.schema` costs one query and writes nothing.
 */
export async function sweepAclReferences(
  tx: Db,
  change: PrincipalChange
): Promise<void> {
  const forms = await tx.$queryRaw<{ id: string; schema: unknown }[]>`
    SELECT "id", "schema" FROM "Form"
    WHERE "schema"::text LIKE ${`%"${change.from}"%`}`;
  for (const form of forms) {
    const parsed = parseFormDescriptor(form.schema);
    if (!parsed.descriptor) continue;
    const rewritten = rewriteDescriptorRights(parsed.descriptor, change);
    if (rewritten !== null) {
      await tx.form.update({
        where: { id: form.id },
        data: { schema: rewritten as object },
      });
    }
  }
}
