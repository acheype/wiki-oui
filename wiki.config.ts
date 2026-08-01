// Typed config module (ADR 0004): nothing here is hot-editable in the MVP.
// Operator-facing settings move to a `Settings` table once auth/admin lands.

import type { AccessRule } from "@/lib/permissions";

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
  /**
   * Special pages hosting an account screen (ADR 0028). Every screen of the
   * wiki is a page, signing in included: these slugs are named here because
   * the chrome and the mails have to link to them.
   */
  authPages: {
    signIn: string;
    signUp: string;
    forgotPassword: string;
    invitation: string;
  };
  /** Special pages that feed no layout slot but are still reserved. */
  otherSpecialPages: string[];
  /**
   * The wiki's own rights (docs/permissions.md § Où s'appliquent les droits):
   * who may create a page, and what a page is born with. This file is the
   * only place a human writes rights by hand, and the only one where no
   * cascade can play — it names usernames and group slugs all the same, so
   * that what it writes reads like what a screen shows (ADR 0024).
   *
   * The defaults are *copied* at creation, never linked (ADR 0026): changing
   * one here touches nothing that already exists.
   */
  permissions: {
    createPage: AccessRule;
    defaultPageRead: AccessRule;
    defaultPageWrite: AccessRule;
  };
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
  authPages: {
    signIn: "connexion",
    signUp: "inscription",
    forgotPassword: "mot-de-passe-oublie",
    invitation: "invitation",
  },
  // formulaires/fiches host the form-administration screens (ADR 0014),
  // gerer-utilisateurs the accounts and groups ones and gerer-pages the rights
  // of the whole wiki (docs/permissions.md).
  otherSpecialPages: [
    "aide-memoire",
    "formulaires",
    "fiches",
    "gerer-utilisateurs",
    "gerer-pages",
  ],
  // « Seulement » with an empty list reads as « son propriétaire et les
  // administrateurs » — the shape a wiki where each author looks after what
  // they wrote takes, and the one to widen first when it should be otherwise.
  permissions: {
    createPage: { scope: "authenticated" },
    defaultPageRead: { scope: "everyone" },
    defaultPageWrite: { scope: "restricted" },
  },
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
  ...Object.values(wikiConfig.authPages),
  ...wikiConfig.otherSpecialPages,
];

/** The wiki page an account screen lives on, as a link (`/connexion`). */
export function authPagePath(page: keyof WikiConfig["authPages"]): string {
  return `/${wikiConfig.authPages[page]}`;
}
