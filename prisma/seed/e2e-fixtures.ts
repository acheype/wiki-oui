// E2E-only fixtures (ADR 0032): the restricted-rights content the permission
// parcours read, at the four storeys of docs/permissions.md. Seeded only when
// E2E_FIXTURES is set (e2e/global-setup.ts), so a real install never ships them.
//
//   e2e-restreint      form, « créer une fiche » closed to ordinary users (P1)
//   e2e-champs         form with a read-restricted and a write-restricted field
//   e2e-fiche-ouverte  fiche readable by all — the control
//   e2e-fiche-restreinte  fiche readable by administrators alone (P3)
//   e2e-champs-fiche   fiche of e2e-champs, for the entry-form field cut (P2/P4)
//   e2e-saisie         MDX page hosting <EntryForm id="e2e-restreint"> (P1)
//   e2e-page-restreinte  MDX page readable by administrators alone (page read)
//   e2e-page-lecture   MDX page readable by all, writable by administrators (page write)

import type { Prisma, PrismaClient } from "../../lib/generated/prisma/client";
import {
  computeAutomaticTitle,
  parseFormDescriptor,
  withTitleOrdered,
} from "../../modules/forms/form-descriptor";
import type {
  EntryData,
  FormDescriptor,
} from "../../modules/forms/form-descriptor";
import type { FormPermissions } from "../../modules/permissions/form-level";
import { E2E } from "../../e2e/support/fixtures";

// --- form descriptors --------------------------------------------------------

const restrictedCreate: FormPermissions = {
  // Administrators alone may add a fiche (P1).
  createEntry: { scope: "restricted" },
  defaultEntryRead: { scope: "everyone" },
  defaultEntryWrite: { scope: "authenticated" },
};

const openCreate: FormPermissions = {
  createEntry: { scope: "authenticated" },
  defaultEntryRead: { scope: "everyone" },
  defaultEntryWrite: { scope: "authenticated" },
};

const titleField: FormDescriptor["fields"][number] = {
  type: "title",
  name: "title",
  label: "Nom",
  automatic: true,
  template: "{poste}",
};

const restrictedFormSchema: FormDescriptor = {
  fields: [
    titleField,
    { type: "text", name: E2E.openFieldName, label: E2E.openFieldLabel },
    {
      type: "text",
      name: E2E.restrictedFieldName,
      label: E2E.restrictedFieldLabel,
      readAcl: { scope: "restricted" },
    },
  ],
  permissions: restrictedCreate,
};

const fieldsFormSchema: FormDescriptor = {
  fields: [
    titleField,
    { type: "text", name: E2E.openFieldName, label: E2E.openFieldLabel },
    {
      type: "text",
      name: E2E.restrictedFieldName,
      label: E2E.restrictedFieldLabel,
      // Absent from the entry form and /raw for anyone but an administrator (P2).
      readAcl: { scope: "restricted" },
    },
    {
      type: "text",
      name: E2E.readOnlyFieldName,
      label: E2E.readOnlyFieldLabel,
      // Readable by all, fillable by administrators alone: greyed for the rest,
      // and preserved by the merge when they save (P2).
      writeAcl: { scope: "restricted" },
    },
  ],
  permissions: openCreate,
};

// --- seeding helpers ---------------------------------------------------------

type Scope = "everyone" | "authenticated" | "restricted";

async function ensureForm(
  prisma: PrismaClient,
  slug: string,
  name: string,
  schema: FormDescriptor
) {
  const existing = await prisma.form.findUnique({ where: { slug } });
  if (existing) return existing;
  const form = await prisma.form.create({
    data: { slug, name, schema: schema as unknown as Prisma.InputJsonValue },
  });
  console.log(`+ formulaire e2e ${slug}`);
  return form;
}

async function ensureEntry(
  prisma: PrismaClient,
  form: { id: string; name: string; schema: Prisma.JsonValue },
  slug: string,
  readScope: Scope,
  // Write must never be broader than read (« écrire implique lire »): a
  // restricted-read fiche keeps a restricted write, or any signed-in person
  // would read it through the write right.
  writeScope: Scope,
  data: EntryData
): Promise<void> {
  if (await prisma.page.findUnique({ where: { slug } })) return;
  const descriptor = parseFormDescriptor(form.schema).descriptor;
  // The title is computed and stored like every other writer (ADR 0020).
  const title = descriptor ? computeAutomaticTitle(descriptor, data) : "";
  const stored = descriptor
    ? withTitleOrdered(descriptor, data, title)
    : { ...data, title };
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        slug,
        formId: form.id,
        tags: [form.name],
        readScope,
        writeScope,
      },
    });
    const revision = await tx.revision.create({
      data: { pageId: page.id, data: stored as Prisma.InputJsonValue },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id },
    });
  });
  console.log(`+ fiche e2e ${slug}`);
}

async function ensureMdxPage(
  prisma: PrismaClient,
  slug: string,
  content: string,
  readScope: Scope,
  writeScope: Scope
): Promise<void> {
  if (await prisma.page.findUnique({ where: { slug } })) return;
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { slug, readScope, writeScope },
    });
    const revision = await tx.revision.create({
      data: { pageId: page.id, content },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id },
    });
  });
  console.log(`+ page e2e ${slug}`);
}

/** Idempotent, like the main seed: an existing form, fiche or page is left alone. */
export async function seedE2eFixtures(prisma: PrismaClient): Promise<void> {
  const restricted = await ensureForm(
    prisma,
    E2E.restrictedForm,
    "E2E restreint",
    restrictedFormSchema
  );
  const fields = await ensureForm(
    prisma,
    E2E.fieldsForm,
    "E2E champs",
    fieldsFormSchema
  );

  await ensureEntry(prisma, restricted, E2E.openEntry, "everyone", "authenticated", {
    poste: "Poste ouvert",
    salaire: "1500",
  });
  // Admins only, read and write alike (write implies read).
  await ensureEntry(prisma, restricted, E2E.restrictedEntry, "restricted", "restricted", {
    poste: "Poste restreint",
    salaire: "3200",
  });
  await ensureEntry(prisma, fields, E2E.fieldsEntry, "everyone", "authenticated", {
    poste: "Poste champs",
    salaire: "4000",
    note: "Note interne",
  });

  await ensureMdxPage(
    prisma,
    E2E.entryFormPage,
    `# Saisie e2e\n\n<EntryForm id="${E2E.restrictedForm}" />\n`,
    "everyone",
    "authenticated"
  );
  await ensureMdxPage(
    prisma,
    E2E.restrictedPage,
    "# Page restreinte\n\nContenu réservé aux administrateurs.\n",
    // Admins only, read and write alike (write implies read).
    "restricted",
    "restricted"
  );
  await ensureMdxPage(
    prisma,
    E2E.readOnlyPage,
    "# Page en lecture seule\n\nLisible par tous, modifiable par les administrateurs.\n",
    "everyone",
    "restricted"
  );
}
