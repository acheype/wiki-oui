// Pure rules for the « Mots-clés déjà utilisés » suggestion (issue #15):
// ranking already-used values by frequency, and what a widget offers under
// the current draft. No database, no Server Action — those are the doors
// next to it (lib/pages.ts listPageTags, app/form-actions.ts
// listUsedFieldValues), which feed this module the raw occurrences.

export const SUGGESTION_LIMIT = 8;

/** Case- and diacritics-insensitive comparison key ("ecole" matches "École"). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Distinct values, most used first; ties settled alphabetically. */
export function rankByFrequency(occurrences: string[]): string[] {
  // Grouped by fold: "Atelier" seen 12 times and "atelier" seen 3 times form
  // one candidate weighing 15, whose spelling is the group's most frequent \u2014
  // the dominant one, not the first encountered. That is what gives
  // alignSpelling its meaning: an added word rallies to what is actually in
  // use, not to whichever variant happened to arrive first.
  const spellingCounts = new Map<string, Map<string, number>>();
  for (const value of occurrences) {
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
export function suggestTags(input: {
  candidates: string[];
  draft: string;
  placed: string[];
}): string[] {
  const { candidates, draft, placed } = input;
  const placedKeys = new Set(placed.map(fold));
  // The order the caller passed in (typically rankByFrequency's output) is
  // kept throughout: filtering is stable, so the frequency ranking survives.
  const available = candidates.filter((candidate) => !placedKeys.has(fold(candidate)));

  const query = fold(draft.trim());
  if (query === "") {
    return available.length <= SUGGESTION_LIMIT ? available : [];
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
