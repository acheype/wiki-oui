// Slug rules from ADR 0001: lowercase kebab, typed directly in the URL.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * The one URL segment WikiOui serves itself (ADR 0012, 0028): every other
 * address is a wiki page. The installation service lives under it too and is
 * presented by rewriting whatever address was asked for (ADR 0027), so
 * `installation` stays an ordinary slug — free for a page, which opens as
 * soon as the wiki is installed.
 */
export const API_SEGMENT = "api";

/**
 * Why a page may not take this slug, or null when it may: a page named after
 * the reserved segment would exist in the database and never open, the route
 * answering first. Existing pages are a separate matter — that collision is
 * a lookup, worded by each caller.
 */
export function reservedSlugRefusal(slug: string): string | null {
  return slug === API_SEGMENT
    ? `L'adresse «\u00A0${slug}\u00A0» est réservée à WikiOui.`
    : null;
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

// Live-typing normalization for slug inputs (the shared SlugInput):
// lowercase, accents transliterated, separator-like characters (spaces,
// apostrophes, underscores, dots) turned into dashes, anything else simply
// not typed. Runs of dashes collapse and a leading dash is dropped; a
// trailing dash stays — otherwise hyphens are impossible to type — leaving
// full validity to the save- or confirm-time isValidSlug check.
export function normalizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'’_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "");
}

// Internal wiki href as written by authors (ADR 0006): a bare slug, optionally
// followed by a handler segment and/or an anchor, e.g. "ma-page",
// "ma-page/edit", "ma-page#section".
const WIKI_HREF_PATTERN =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(?:edit|revisions))?(?:#.*)?$/;

export function isWikiHref(href: string): boolean {
  return WIKI_HREF_PATTERN.test(href);
}

/** The slug segment of a wiki href, null when the href is not one. */
export function wikiHrefSlug(href: string): string | null {
  return WIKI_HREF_PATTERN.exec(href)?.[1] ?? null;
}

// External link (ADR 0006): an absolute http(s) URL, as opposed to an internal
// wiki href (isWikiHref) or a bare slug typed by the author.
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}
