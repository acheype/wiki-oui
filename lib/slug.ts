// Slug rules from ADR 0001: lowercase kebab, typed directly in the URL.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

// Internal wiki href as written by authors (ADR 0006): a bare slug, optionally
// followed by a handler segment and/or an anchor, e.g. "ma-page",
// "ma-page/edit", "ma-page#section".
const WIKI_HREF_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:edit|revisions))?(?:#.*)?$/;

export function isWikiHref(href: string): boolean {
  return WIKI_HREF_PATTERN.test(href);
}
