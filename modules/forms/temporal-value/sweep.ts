// The database side of a change of Date / heure mode (docs/forms.md §
// Changer le mode d'un champ): runs inside the saveForm transaction, after
// the schema overwrite and the field-rename sweep. Like the title recompute
// (modules/forms/entry-title/sweep.ts), a conversion changes what an entry
// *says*, so it mints a new current revision rather than rewriting history.

import {
  type EntryData,
  type FormDescriptor,
  computeAutomaticTitle,
  orderedEntryData,
  readEntryData,
  withTitleOrdered,
} from "@/modules/forms/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type ConversionOutcome,
  type TemporalModeChange,
  convertEntryValues,
} from "./conversion";

type Db = Prisma.TransactionClient;

/** Per changed field, how many entries each outcome touches. */
export type TemporalConversionImpact = ({
  label: string;
} & Record<ConversionOutcome, number>)[];

interface Conversion {
  pageId: string;
  data: EntryData;
  outcomes: Record<string, ConversionOutcome>;
}

/**
 * The work and its headcount from one pass, so the confirmation and the sweep
 * can never disagree. An entry whose values do not change yields nothing.
 */
async function planConversions(
  db: Db,
  formId: string,
  changes: readonly TemporalModeChange[]
): Promise<Conversion[]> {
  const pages = await db.page.findMany({
    where: { formId },
    include: { current: true },
  });
  return pages.flatMap((page) => {
    if (!page.current) return [];
    const stored = readEntryData(page.current.data);
    const { data, outcomes } = convertEntryValues(stored, changes);
    return Object.keys(outcomes).length > 0
      ? [{ pageId: page.id, data, outcomes }]
      : [];
  });
}

function impactOf(
  conversions: Conversion[],
  changes: readonly TemporalModeChange[]
): TemporalConversionImpact {
  return changes.flatMap((change) => {
    const counts = { timeDropped: 0, emptied: 0, timeMissing: 0 };
    for (const { outcomes } of conversions) {
      const outcome = outcomes[change.name];
      if (outcome) counts[outcome]++;
    }
    return counts.timeDropped + counts.emptied + counts.timeMissing > 0
      ? [{ label: change.label, ...counts }]
      : [];
  });
}

/** The confirmation's headcount, against the stored values. */
export async function countTemporalConversion(
  db: Db,
  formId: string,
  changes: readonly TemporalModeChange[]
): Promise<TemporalConversionImpact> {
  return impactOf(await planConversions(db, formId, changes), changes);
}

/**
 * The conversion itself: a new revision per entry whose values change. An
 * automatic title is recomputed in the same revision, since it may quote a
 * converted value (ADR 0020) — one save, one new revision per entry.
 */
export async function sweepTemporalValues(
  db: Db,
  formId: string,
  descriptor: FormDescriptor,
  changes: readonly TemporalModeChange[],
  authorUsername: string | null
): Promise<void> {
  for (const conversion of await planConversions(db, formId, changes)) {
    // A value merely missing its time is kept as it is: no revision for it.
    const outcomes = Object.values(conversion.outcomes);
    if (outcomes.every((outcome) => outcome === "timeMissing")) continue;
    const title = computeAutomaticTitle(descriptor, conversion.data);
    const data =
      title.trim() === ""
        ? orderedEntryData(descriptor, conversion.data)
        : withTitleOrdered(descriptor, conversion.data, title);
    const revision = await db.revision.create({
      data: {
        pageId: conversion.pageId,
        data: data as Prisma.InputJsonValue,
        authorUsername,
      },
    });
    await db.page.update({
      where: { id: conversion.pageId },
      data: { currentRevisionId: revision.id },
    });
  }
}
