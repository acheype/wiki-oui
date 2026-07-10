// Typed config module (ADR 0004): nothing here is hot-editable in the MVP.
// Operator-facing settings move to a `Settings` table once auth/admin lands.

export interface WikiConfig {
  /** Target of the `/` redirect. */
  homeSlug: string;
  /** Special pages whose content feeds the site layout. */
  layoutPages: {
    title: string;
    topMenu: string;
    topQuickAccess: string;
    header: string;
    footer: string;
  };
  /** Special pages that feed no layout slot but are still reserved. */
  otherSpecialPages: string[];
}

export const wikiConfig = {
  homeSlug: "page-principale",
  layoutPages: {
    title: "page-titre",
    topMenu: "page-menu-haut",
    topQuickAccess: "page-rapide-haut",
    header: "page-header",
    footer: "page-footer",
  },
  otherSpecialPages: ["aide-memoire"],
} as const satisfies WikiConfig;

/** Reserved slugs: seeded at startup, editable, never deletable. */
export const specialSlugs: readonly string[] = [
  wikiConfig.homeSlug,
  ...Object.values(wikiConfig.layoutPages),
  ...wikiConfig.otherSpecialPages,
];
