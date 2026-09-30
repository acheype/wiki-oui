import { prisma } from "@/lib/prisma";
import {
  type FormDescriptor,
  parseFormDescriptor,
} from "@/modules/forms/form-descriptor";
import type { FieldRenameMapping } from "@/modules/forms/field-rename/rules";
import { sweepFieldRenames } from "@/modules/forms/field-rename/sweep";
import { titleRecomputeNeeded } from "@/modules/forms/entry-title";
import {
  type TitleRecomputeImpact,
  countTitleRecompute,
  sweepEntryTitles,
} from "@/modules/forms/entry-title/sweep";
import {
  assertFormStructuringOf,
  editableForm,
} from "@/modules/forms/access/guards";
import {
  currentAllows,
  currentUsername,
} from "@/modules/permissions/person";
import { refuse } from "@/modules/permissions/rules";
import { COLD_ADMIN_TRANSACTION_TIMEOUT_MS } from "@/modules/pages/rights";
import { wikiConfig } from "@/wiki.config";

export interface FormDefinition {
  name: string;
  schema: FormDescriptor;
  template: string | null;
}

/** Whether the wiki-wide rule allows this person to create a form. */
export async function currentCanCreateForm(): Promise<boolean> {
  return currentAllows(wikiConfig.permissions.createForm);
}

/** Creates a form owned by the person whom the wiki-wide rule admits. */
export async function createForm(
  slug: string,
  definition: FormDefinition
): Promise<void> {
  if (!(await currentCanCreateForm())) refuse("createForm");
  const ownerUsername = await currentUsername();
  await prisma.form.create({ data: { ...definition, slug, ownerUsername } });
}

function titlesNeedRecompute(
  currentSchema: unknown,
  candidate: FormDescriptor
): boolean {
  const current = parseFormDescriptor(currentSchema).descriptor;
  return current !== undefined && titleRecomputeNeeded(current, candidate);
}

/** What the title part of this save would change, for its confirmation. */
export async function countSaveTitleImpact(
  formSlug: string,
  candidate: FormDescriptor
): Promise<TitleRecomputeImpact | null> {
  const form = await editableForm(formSlug);
  if (!form || !titlesNeedRecompute(form.schema, candidate)) return null;
  return countTitleRecompute(prisma, form.id, candidate);
}

/**
 * Saves an existing form and derives every resulting maintenance operation
 * from the definition currently stored in the same transaction.
 */
export async function saveFormDefinition(
  formId: string,
  definition: FormDefinition,
  fieldRenames: FieldRenameMapping
): Promise<void> {
  await assertFormStructuringOf(formId);
  const person = await currentUsername();
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.form.findUniqueOrThrow({
        where: { id: formId },
        select: { schema: true },
      });
      await tx.form.update({ where: { id: formId }, data: definition });
      await sweepFieldRenames(tx, formId, fieldRenames);
      if (titlesNeedRecompute(current.schema, definition.schema)) {
        await sweepEntryTitles(tx, formId, definition.schema, person);
      }
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}
