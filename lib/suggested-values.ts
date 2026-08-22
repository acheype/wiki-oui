// Pure rules behind the "already-used values" suggestion (issue #15), shared
// by the two vocabularies the widget serves without ever mixing them
// (docs/forms.md, "Mots-cles != tags de Page"): ranking occurrences by
// frequency, and choosing what to offer under the current draft. The doors
// feeding it raw occurrences sit next to it -- lib/pages.ts listPageTags,
// app/form-actions.ts listUsedFieldValues.

import { fold } from "./fold";

export const SUGGESTION_LIMIT = 6;

/** Distinct values, most used first; ties settled alphabetically. */
export function rankByFrequency(occurrences: string[]): string[] {
  // Grouped by fold, so that "Atelier" seen 12 times and "atelier" seen 3
  // times form one candidate weighing 15, spelled the way the group mostly
  // spells it. That is what gives alignSpelling its meaning: an added word
  // rallies to what is in use, not to whichever variant arrived first.
  const spellingCounts = new Map<string, Map<string, number>>();
  for (const occurrence of occurrences) {
    const value = occurrence.trim();
    if (value === "") continue;
    const key = fold(value);
    const spellings = spellingCounts.get(key) ?? new Map<string, number>();
    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    spellingCounts.set(key, spellings);
  }

  const candidates = [...spellingCounts.values()].map((spellings) => {
    const total = [...spellings.values()].reduce((sum, n) => sum + n, 0);
    const spelling = [...spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")
    )[0][0];
    return { spelling, total };
  });

  return candidates
    .sort(
      (a, b) => b.total - a.total || a.spelling.localeCompare(b.spelling, "fr")
    )
    .map((candidate) => candidate.spelling);
}

/** What the widget offers under the current draft. */
export function suggestValues(input: {
  candidates: string[];
  draft: string;
  placed: string[];
}): string[] {
  const { candidates, draft, placed } = input;
  const placedKeys = new Set(placed.map(fold));
  // The caller's order (rankByFrequency's output) survives: filtering is
  // stable, so the most used values stay in front.
  const available = candidates.filter(
    (candidate) => !placedKeys.has(fold(candidate))
  );

  const query = fold(draft.trim());
  // Nothing typed yet: the panel opens on focus with the head of the list --
  // the most used values, or the most recent ones where frequency has no
  // meaning. Eight of two hundred is a suggestion, not an inventory.
  if (query === "") {
    return available.slice(0, SUGGESTION_LIMIT);
  }

  return available
    .filter((candidate) => {
      const key = fold(candidate);
      return key !== query && key.includes(query);
    })
    .slice(0, SUGGESTION_LIMIT);
}

/** The spelling an added word takes: the one already in use, when there is one. */
export function alignSpelling(word: string, candidates: string[]): string {
  const key = fold(word);
  return candidates.find((candidate) => fold(candidate) === key) ?? word;
}
