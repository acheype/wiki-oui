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
import { isExternalHref, wikiHrefSlug } from "@/lib/slug";
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
}: {
  /** Internal slug or wiki href, or an external http(s) URL. */
  target: string;
  /** Internal only: drop the page title (a container already names it). */
  hideTitle?: boolean;
  /** External fallback box when no height is measured or messaged. */
  ratio?: FrameRatio;
  title?: string;
  className?: string;
}) {
  const external = isExternalHref(target);
  const src = external
    ? target
    : `/${wikiHrefSlug(target) ?? target}/iframe${hideTitle ? "?title=hidden" : ""}`;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // A fresh target starts unmeasured so the previous height never lingers.
    setHeight(undefined);
    let observer: ResizeObserver | undefined;

    // Same-origin: read the render box directly. Cross-origin: contentDocument
    // access throws, and the postMessage listener below takes over.
    const onLoad = () => {
      let box: HTMLElement | null = null;
      try {
        box = iframe.contentDocument?.querySelector("[data-wiki-frame]") ?? null;
      } catch {
        return; // cross-origin, walled off
      }
      if (!box) return;
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

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title || "Fiche"}
      // A frame with no measured height yet must not collapse to the browser
      // default; 240 is a plausible first paint before onLoad measures.
      style={{ height: height ?? 240 }}
      className={cn("w-full bg-background", className)}
    />
  );
}
