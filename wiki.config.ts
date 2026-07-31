// Typed config module (ADR 0004): nothing here is hot-editable in the MVP.
// Operator-facing settings move to a `Settings` table once auth/admin lands.

export interface WikiConfig {
  /** Target of the `/` redirect. */
  homeSlug: string;
  /**
   * Free sign-up, closed by default (docs/permissions.md § Naissance d'un
   * compte): accounts are born of an invitation, and a wiki nobody has to
   * moderate is not the common case. Opened here, a « Créer un compte »
   * appears beside the sign-in form and the sign-up endpoint answers again.
   */
  openSignUp: boolean;
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
  icons: {
    /**
     * Embedded Iconify sets offered by the icon picker. Each name needs its
     * data package installed (@iconify-json/{set}) and registered in
     * lib/icons.ts — rendering is server-side inline SVG, no network call.
     */
    sets: string[];
  };
  upload: {
    /** Bytes; checked before any write (ADR 0012). */
    maxFileSize: number;
    /** Bytes; tighter limit for the image family. */
    maxImageSize: number;
    /**
     * Allowed extensions grouped by family: the family routes an upload to
     * its component (image → <Image>, pdf → mini-choice, other → <FileLink>)
     * and filters the file-list comboboxes.
     */
    allowedExtensions: {
      image: string[];
      pdf: string[];
      other: string[];
    };
  };
}

export const wikiConfig = {
  homeSlug: "page-principale",
  openSignUp: false,
  layoutPages: {
    title: "page-titre",
    topMenu: "page-menu-haut",
    topQuickAccess: "page-rapide-haut",
    header: "page-header",
    footer: "page-footer",
  },
  // formulaires/fiches host the form-administration screens (ADR 0014),
  // gerer-utilisateurs the accounts and groups ones (docs/permissions.md).
  otherSpecialPages: [
    "aide-memoire",
    "formulaires",
    "fiches",
    "gerer-utilisateurs",
  ],
  icons: {
    sets: ["lucide"],
  },
  upload: {
    maxFileSize: 10_000_000,
    maxImageSize: 2_000_000,
    allowedExtensions: {
      // prettier-ignore
      image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "svg"],
      pdf: ["pdf"],
      // prettier-ignore
      other: [
        "aiff", "anx", "axa", "axv", "asf", "avi", "flac", "flv", "json",
        "geojson", "mid", "mng", "mka", "mkv", "mov", "mp3", "mp4", "mpg",
        "mscz", "oga", "ogg", "ogv", "ogx", "qt", "ra", "ram", "rm", "spx",
        "swf", "wav", "wmv", "3gp", "abw", "ai", "bz2", "bin", "blend", "c",
        "cls", "css", "csv", "deb", "doc", "docx", "djvu", "dvi", "eps",
        "gz", "h", "kml", "kmz", "md", "mm", "pas", "pgn", "ppt", "pptx",
        "ps", "psd", "pub", "rpm", "rtf", "sdd", "sdw", "sit", "sty", "sxc",
        "sxi", "sxw", "tex", "tgz", "torrent", "ttf", "txt", "xcf", "xspf",
        "xls", "xlsx", "xlsm", "yaml", "zip", "scar", "odt", "ods", "odp",
        "odg", "odc", "odf", "odb", "odi", "odm", "ott", "ots", "otp", "otg",
      ],
    },
  },
} as const satisfies WikiConfig;

/** Reserved slugs: seeded at startup, editable, never deletable. */
export const specialSlugs: readonly string[] = [
  wikiConfig.homeSlug,
  ...Object.values(wikiConfig.layoutPages),
  ...wikiConfig.otherSpecialPages,
];
