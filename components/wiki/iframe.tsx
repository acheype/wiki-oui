import { hiddenIfNoAccess } from "@/lib/pages";
import { isExternalHref } from "@/lib/slug";
import { WikiFrame, type FrameRatio } from "./internal/wiki-frame";

export type IframeProps = {
  /** A wiki page (slug or href) when internal, an http(s) URL when external. */
  link: string;
  /** Author default; unchecking it switches the field to a wiki page picker. */
  external?: boolean;
  /** External fallback box (an internal page auto-sizes to its content). */
  ratio?: FrameRatio;
  /** Accessible name, external only — an internal page takes its own title. */
  title?: string;
  /**
   * Advanced: vanish instead of showing the refusal block for a page this
   * reader may not read (docs/permissions.md § Liens et boutons vers
   * l'inaccessible). Unchecked, the frame still shows it — in its compact
   * form, `/{slug}/iframe`'s own doing (app/(bare)/[slug]/iframe/page.tsx).
   */
  hideIfNoAccess?: boolean;
};

// <Iframe> (ex-<Embed>): embeds a wiki page or another site's page, built on
// WikiFrame (ADR 0022). The safe half of the raw <iframe> tag reachable from
// the menu (ADR 0002): `srcdoc` is not expressible, and external targets are
// sandboxed without allow-top-navigation. An external page keeps a ratio box
// (cross-origin, height unknown); an internal page loads the chrome-free
// /{slug}/iframe render, auto-sizes, and takes its accessible name from the
// page title (so the author fills no `title` in that case).
export async function Iframe({
  link,
  external = true,
  ratio = "landscape",
  title,
  hideIfNoAccess = false,
}: IframeProps) {
  if (!link) return null;
  // An external target must be a real http(s) URL: `javascript:`/`data:` render
  // nothing (WikiFrame would otherwise treat them as a bogus internal slug).
  if (external && !isExternalHref(link)) return null;
  if (!external && (await hiddenIfNoAccess(link, hideIfNoAccess))) return null;
  return (
    <WikiFrame target={link} ratio={ratio} title={external ? title : undefined} />
  );
}
