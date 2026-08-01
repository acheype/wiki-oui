// How `gerer-pages` reads its list (docs/permissions.md § gerer-pages): the
// search, the Tout/Pages/Fiches filter and the formulaire filter, kept here
// rather than in the screen because the selection follows them — acting on a
// page one has filtered out is the surprise that screen exists to avoid, and a
// tick surviving the filter that hid it is a bug the eye does not catch.

import type { ManagedPage } from "@/lib/pages";

/** The three answers to « Type », and what each keeps of the list. */
export const KINDS = [
  { value: "all", label: "Tout" },
  { value: "pages", label: "Pages" },
  { value: "entries", label: "Fiches" },
] as const;

export type KindFilter = (typeof KINDS)[number]["value"];

/** What the three filters hold between them. A null formulaire is « Tous ». */
export interface Criteria {
  needle: string;
  kind: KindFilter;
  formSlug: string | null;
}

export const EVERYTHING: Criteria = { needle: "", kind: "all", formSlug: null };

/**
 * The type and the formulaire are one question asked at two levels of
 * precision, so they never contradict each other: naming a formulaire is
 * asking for its fiches — one click, not two — and stepping back to Tout or to
 * Pages drops the formulaire, which no page has anyway.
 */
export function coherent(current: Criteria, next: Partial<Criteria>): Criteria {
  const asked = { ...current, ...next };
  if (next.formSlug != null) return { ...asked, kind: "entries" };
  if (next.kind === "all" || next.kind === "pages") {
    return { ...asked, formSlug: null };
  }
  return asked;
}

function matchesKind(page: ManagedPage, kind: KindFilter): boolean {
  if (kind === "pages") return page.form === null;
  if (kind === "entries") return page.form !== null;
  return true;
}

/** The lines the three filters leave, in the order the list holds them. */
export function pagesMatching(
  pages: readonly ManagedPage[],
  { needle, kind, formSlug }: Criteria
): ManagedPage[] {
  const searched = needle.trim().toLowerCase();
  return pages.filter(
    (page) =>
      page.slug.toLowerCase().includes(searched) &&
      matchesKind(page, kind) &&
      (formSlug === null || page.form?.slug === formSlug)
  );
}

/** The formulaires the list actually holds fiches of, in the order they read. */
export function formsOf(
  pages: readonly ManagedPage[]
): { slug: string; name: string }[] {
  const bySlug = new Map(
    pages.flatMap((page) => (page.form ? [[page.form.slug, page.form]] : []))
  );
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
