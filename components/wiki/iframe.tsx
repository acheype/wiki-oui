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
};

// <Iframe> (ex-<Embed>): embeds a wiki page or another site's page, built on
// WikiFrame (ADR 0022). The safe half of the raw <iframe> tag reachable from
// the menu (ADR 0002): `srcdoc` is not expressible, and external targets are
// sandboxed without allow-top-navigation. An external page keeps a ratio box
// (cross-origin, height unknown); an internal page loads the chrome-free
// /{slug}/iframe render, auto-sizes, and takes its accessible name from the
// page title (so the author fills no `title` in that case).
export function Iframe({
  link,
  external = true,
  ratio = "landscape",
  title,
}: IframeProps) {
  if (!link) return null;
  // An external target must be a real http(s) URL: `javascript:`/`data:` render
  // nothing (WikiFrame would otherwise treat them as a bogus internal slug).
  if (external && !isExternalHref(link)) return null;
  return (
    <WikiFrame target={link} ratio={ratio} title={external ? title : undefined} />
  );
}
