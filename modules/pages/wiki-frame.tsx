"use client";

// A page framed at its natural height, the single primitive behind every
// in-iframe rendering (popup, unfolded Liste row, map panel, ModalLink, the
// <Iframe> component). One iframe, one height sensor picked by what the origin
// allows:
//
//   - internal target -> loads the chrome-free /{slug}/iframe render, which is
//     same-origin: the height is read straight from its [data-wiki-frame] box
//     (authoritative, no handshake).
//   - external target -> loads the URL sandboxed (ADR 0002); cross-origin, so
//     contentDocument is walled off. The height then arrives by postMessage
//     when the frame speaks our protocol (another WikiOui), else the frame
//     keeps its ratio box.

import { useEffect, useRef, useState } from "react";
import { isExternalHref, isValidSlug, wikiHrefSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

const RATIO_CLASSES = {
  landscape: "aspect-[4/3]",
  portrait: "aspect-[3/4]",
  square: "aspect-square",
} as const;

export type FrameRatio = keyof typeof RATIO_CLASSES;

export function WikiFrame({
  target,
  hideTitle = false,
  ratio = "landscape",
  title,
  className,
  onTitle,
}: {
  /** Internal slug or wiki href, or an external http(s) URL. */
  target: string;
  /** Internal only: drop the page title (a container already names it). */
  hideTitle?: boolean;
  /**
   * Internal only, and only alongside `hideTitle`: called with the title the
   * render took off, so the container can show it — undefined while nothing
   * is read yet, and for a page that has no title of its own.
   */
  onTitle?: (title: string | undefined) => void;
  /** External fallback box when no height is measured or messaged. */
  ratio?: FrameRatio;
  title?: string;
  className?: string;
}) {
  const external = isExternalHref(target);
  // ModalLink passes a resolved path ("/{slug}"), while other callers pass a
  // bare slug — strip the leading slash so wikiHrefSlug always sees a slug.
  const bare = !external && target.startsWith("/") ? target.slice(1) : target;
  // Internal target must resolve to a real slug: a `javascript:`/`data:` string
  // (not http(s), so not "external" here) or any invalid slug renders nothing,
  // never a bogus /{…}/iframe src.
  const slug = external ? null : wikiHrefSlug(bare) ?? bare;
  const src = external
    ? target
    : slug && isValidSlug(slug)
      ? `/${slug}/iframe${hideTitle ? "?title=hidden" : ""}`
      : null;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  // Internal only: the embedded page's <title>, read same-origin, becomes the
  // frame's accessible name (WCAG H64) when the caller passes none.
  const [docTitle, setDocTitle] = useState<string>();
  // Read inside the load handler, which the [src] effect binds once.
  const onTitleRef = useRef(onTitle);
  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !src) return;
    // A fresh target starts unmeasured so the previous height never lingers.
    setHeight(undefined);
    setDocTitle(undefined);
    onTitleRef.current?.(undefined);
    let observer: ResizeObserver | undefined;

    // Same-origin: read the render box directly. Cross-origin: contentDocument
    // access throws, and the postMessage listener below takes over.
    const onLoad = () => {
      let box: HTMLElement | null = null;
      try {
        setDocTitle(iframe.contentDocument?.title || undefined);
        box = iframe.contentDocument?.querySelector("[data-wiki-frame]") ?? null;
      } catch {
        return; // cross-origin, walled off
      }
      if (!box) return;
      // What `?title=hidden` took off, for whoever asked to hide it.
      onTitleRef.current?.(box.dataset.wikiTitle || undefined);
      const measure = () => setHeight(box.getBoundingClientRect().height);
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(box);
    };

    // Cross-origin height, only from our own frame. A well-formed number is
    // enough: an absurd value at worst gives an ill-fitting scrollbar, not
    // worth an arbitrary ceiling — but a non-number would collapse the frame.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown };
      if (!data || data.type !== "wikioui:resize") return;
      const value = data.height;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return;
      }
      setHeight(value);
    };

    iframe.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);
    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
      observer?.disconnect();
    };
  }, [src]);

  if (!src) return null;

  if (external) {
    return (
      <iframe
        ref={iframeRef}
        src={src}
        title={title || target}
        // ADR 0002: sandbox without allow-top-navigation (an embedded page must
        // not redirect the reader's whole tab), no referrer leak, http(s) only.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={height ? { height } : undefined}
        className={cn(
          "w-full rounded-md border bg-background",
          // Ratio box until (if ever) a height is messaged in.
          height === undefined && RATIO_CLASSES[ratio],
          className
        )}
      />
    );
  }

  // Unmeasured: the iframe keeps loading (visibility doesn't pause the
  // fetch) but stays collapsed and invisible behind a skeleton, instead of
  // painting at a guessed height — the target's real content is already
  // taller, so a guessed height would show it clipped with a scrollbar for
  // one frame, then jump to its true size the moment /{slug}/iframe's box is
  // measured. h-60 echoes the old 240px guess, only now nothing is ever
  // shown at the wrong size.
  const measuring = height === undefined;
  return (
    <div>
      {measuring && (
        <div className="h-60 w-full animate-pulse rounded-md bg-muted/40" />
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title={title || docTitle || "Fiche"}
        // This frame is always sized to its exact content, so its own
        // scrollbar should never be needed — not even the moment it's
        // collapsed to 0 while measuring. Chrome doesn't reliably drop that
        // scrollbar once the frame grows past it (Firefox does); `no` sidesteps
        // relying on that recalculation instead of chasing the inconsistency.
        scrolling="no"
        style={measuring ? undefined : { height }}
        className={cn(
          "w-full bg-background",
          measuring && "invisible h-0",
          className
        )}
      />
    </div>
  );
}
