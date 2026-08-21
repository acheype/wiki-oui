import type { Prisma } from "./generated/prisma/client";
import { type EntryData, parseFormDescriptor } from "@/modules/forms/form-descriptor";
import {
  type SlugKind,
  type SlugRename,
  rewriteEntryDataSlugs,
  rewriteFormDescriptorSlugs,
  rewriteSlugReferences,
} from "./slug-rename";

// The database side of a slug rename (ADR 0016), shared by « Changer
// l'adresse » (pages) and « Changer l'identifiant » (forms): a LIKE prefilter
// narrows the candidates, the rewrite engine gives the byte-precise answer.

/** Referencing sources, counted for the rename dialog's headcount. */
export interface SlugReferenceImpact {
  pages: number;
  entries: number;
  forms: number;
}

// Works both inside a transaction and on the bare client.
type Db = Prisma.TransactionClient;

// One revision or form row that may reference the slug (prefilter only).
type CandidateRevision = {
  id: string;
  content: string | null;
  data: unknown;
  formId: string | null;
};

type CandidateForm = { id: string; template: string | null; schema: unknown };

// A same-slug rename touches every reference and nothing else: the engine
// returning non-null IS the "this source references the slug" answer.
function referenceProbe(slug: string): SlugRename {
  return { oldSlug: slug, newSlug: slug };
}

async function loadDescriptors(db: Db, formIds: string[]) {
  const forms = await db.form.findMany({
    where: { id: { in: formIds } },
    select: { id: true, schema: true },
  });
  const descriptors = new Map<
    string,
    NonNullable<ReturnType<typeof parseFormDescriptor>["descriptor"]>
  >();
  for (const form of forms) {
    const parsed = parseFormDescriptor(form.schema);
    if (parsed.descriptor) descriptors.set(form.id, parsed.descriptor);
  }
  return descriptors;
}

/**
 * How many pages, entries and form definitions reference this slug today.
 * Counts current revisions only — a rename sweeps all of history, but the
 * numbers an admin reasons about are the live ones. The renamed thing's own
 * references to itself are left out of its headcount.
 */
export async function countSlugReferenceImpact(
  db: Db,
  slug: string,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>,
  kind: SlugKind
): Promise<SlugReferenceImpact> {
  const probe = referenceProbe(slug);
  const like = `%${slug}%`;
  // Self-exclusions per namespace: a page rename skips the page's own
  // content, a form rename skips the form's own definition. The empty string
  // matches no slug, so the other namespace's filter is inert.
  const selfPage = kind === "page" ? slug : "";
  const selfForm = kind === "form" ? slug : "";

  const [rows, formRows] = await Promise.all([
    db.$queryRaw<CandidateRevision[]>`
      SELECT r."id", r."content", r."data", p."formId"
      FROM "Page" p JOIN "Revision" r ON r."id" = p."currentRevisionId"
      WHERE p."slug" <> ${selfPage}
        AND (r."content" LIKE ${like} OR r."data"::text LIKE ${like})`,
    db.$queryRaw<CandidateForm[]>`
      SELECT "id", "template", "schema" FROM "Form"
      WHERE "slug" <> ${selfForm}
        AND ("template" LIKE ${like} OR "schema"::text LIKE ${like})`,
  ]);

  const descriptors = await loadDescriptors(
    db,
    rows.flatMap((row) => row.formId ?? [])
  );

  const impact: SlugReferenceImpact = { pages: 0, entries: 0, forms: 0 };
  for (const row of rows) {
    if (row.content !== null) {
      if (
        rewriteSlugReferences(row.content, probe, referenceProps, kind) !== null
      ) {
        impact.pages += 1;
      }
      continue;
    }
    const descriptor = row.formId ? descriptors.get(row.formId) : undefined;
    if (
      descriptor &&
      rewriteEntryDataSlugs(
        descriptor,
        row.data as EntryData,
        probe,
        referenceProps,
        kind
      ) !== null
    ) {
      impact.entries += 1;
    }
  }
  for (const form of formRows) {
    const parsed = parseFormDescriptor(form.schema);
    const inTemplate =
      form.template !== null &&
      rewriteSlugReferences(form.template, probe, referenceProps, kind) !==
        null;
    const inSchema =
      parsed.descriptor !== undefined &&
      rewriteFormDescriptorSlugs(
        parsed.descriptor,
        probe,
        referenceProps,
        kind
      ) !== null;
    if (inTemplate || inSchema) impact.forms += 1;
  }
  return impact;
}

/**
 * The retcon itself (ADR 0016): rewrites every reference in place — all
 * revisions of all pages and entries (history included, no revision minted)
 * plus form templates and schemas. Runs inside the caller's transaction,
 * after the slug itself has been flipped.
 */
export async function sweepSlugReferences(
  tx: Db,
  rename: SlugRename,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>,
  kind: SlugKind
): Promise<void> {
  const like = `%${rename.oldSlug}%`;

  const revisions = await tx.$queryRaw<CandidateRevision[]>`
    SELECT r."id", r."content", r."data", p."formId"
    FROM "Revision" r JOIN "Page" p ON p."id" = r."pageId"
    WHERE r."content" LIKE ${like} OR r."data"::text LIKE ${like}`;
  const descriptors = await loadDescriptors(
    tx,
    revisions.flatMap((row) => row.formId ?? [])
  );

  for (const revision of revisions) {
    if (revision.content !== null) {
      const content = rewriteSlugReferences(
        revision.content,
        rename,
        referenceProps,
        kind
      );
      if (content !== null) {
        await tx.revision.update({
          where: { id: revision.id },
          data: { content },
        });
      }
      continue;
    }
    const descriptor = revision.formId
      ? descriptors.get(revision.formId)
      : undefined;
    if (!descriptor) continue;
    const data = rewriteEntryDataSlugs(
      descriptor,
      revision.data as EntryData,
      rename,
      referenceProps,
      kind
    );
    if (data !== null) {
      await tx.revision.update({
        where: { id: revision.id },
        data: { data: data as object },
      });
    }
  }

  const forms = await tx.$queryRaw<CandidateForm[]>`
    SELECT "id", "template", "schema" FROM "Form"
    WHERE "template" LIKE ${like} OR "schema"::text LIKE ${like}`;
  for (const form of forms) {
    const template =
      form.template !== null
        ? rewriteSlugReferences(form.template, rename, referenceProps, kind)
        : null;
    const parsed = parseFormDescriptor(form.schema);
    const schema = parsed.descriptor
      ? rewriteFormDescriptorSlugs(
          parsed.descriptor,
          rename,
          referenceProps,
          kind
        )
      : null;
    if (template !== null || schema !== null) {
      await tx.form.update({
        where: { id: form.id },
        data: {
          ...(template !== null && { template }),
          ...(schema !== null && { schema: schema as object }),
        },
      });
    }
  }
}
