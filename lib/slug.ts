// Slug rules from ADR 0001: lowercase kebab, typed directly in the URL.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

// Derives a slug from free text (lowercase, accents transliterated): the
// shared move behind the fixed identities of ADR 0014 (form slug from its
// name, field name from its label, entry slug from its title) and uploaded
// file names (ADR 0012). Can return "" when nothing survives — callers
// decide their fallback.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Internal wiki href as written by authors (ADR 0006): a bare slug, optionally
// followed by a handler segment and/or an anchor, e.g. "ma-page",
// "ma-page/edit", "ma-page#section".
const WIKI_HREF_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:edit|revisions))?(?:#.*)?$/;

export function isWikiHref(href: string): boolean {
  return WIKI_HREF_PATTERN.test(href);
}

// External link (ADR 0006): an absolute http(s) URL, as opposed to an internal
// wiki href (isWikiHref) or a bare slug typed by the author.
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}
