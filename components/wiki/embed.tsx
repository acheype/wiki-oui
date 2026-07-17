import { isExternalHref } from "@/lib/slug";

export type EmbedProps = {
  /** Absolute http(s) URL of the page to embed. */
  url?: string;
  /** Announced to screen readers; falls back to the URL. */
  title?: string;
  ratio?: "landscape" | "portrait" | "square";
};

const ratioClasses: Record<NonNullable<EmbedProps["ratio"]>, string> = {
  landscape: "aspect-[4/3]",
  portrait: "aspect-[3/4]",
  square: "aspect-square",
};

// Embeds another site's page, the job a raw <iframe> used to do before the tag
// allowlist (ADR 0002). Going through a component is what makes the safe half
// of that tag reachable without the dangerous half:
//
//   - `srcdoc` is simply not expressible here, and it was the whole risk: its
//     content inherits *our* origin, so its scripts run inside the wiki. A
//     cross-origin `src`, the case authors actually want, is walled off by the
//     browser's same-origin policy and can read nothing of the page.
//   - `sandbox` without allow-top-navigation keeps the embedded page from
//     redirecting the reader's whole tab, which it could otherwise do on any
//     click. allow-same-origin is what makes ordinary embeds (maps, video)
//     work at all: it grants the frame its *own* origin, never ours.
//   - a title is required for screen readers, and an author filling a form
//     field cannot forget it the way a hand-typed tag does.
export function Embed({ url, title, ratio = "landscape" }: EmbedProps) {
  // http(s) only: `javascript:` and `data:` never become a frame. React blocks
  // the first and gives the second an opaque origin, but neither guarantee is
  // ours, and a refused URL should render nothing rather than lean on them.
  if (!url || !isExternalHref(url)) return null;
  return (
    <iframe
      src={url}
      title={title || url}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`w-full rounded-md border ${ratioClasses[ratio]}`}
    />
  );
}
