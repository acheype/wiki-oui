"use client";

// A page framed at its natural height. Since the modal and the in-place
// renders went inline (ADR 0022), only two callers remain: the <Iframe>
// component and ModalLink's external target. One iframe, one height sensor
// picked by what the origin allows:
//
//   - internal target -> loads the chrome-free /{slug}/iframe render, which is
//     same-origin: the height is read straight from its [data-wiki-frame] box
//     (authoritative, no handshake).
//   - external target -> loads the URL sandboxed (ADR 0002); cross-origin, so
//     contentDocument is walled off. The height then arrives by postMessage
//     when the frame speaks our protocol (another WikiOui), else the frame
//     keeps its ratio box.

import { Loader2 } from "lucide-react";
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
  ratio = "landscape",
  title,
  className,
  onTitle,
  sized = false,
}: {
  /** Internal slug or wiki href, or an external http(s) URL. */
  target: string;
  /** External fallback box when no height is measured or messaged. */
  ratio?: FrameRatio;
  title?: string;
  className?: string;
  /**
   * The frame sits in a container that scrolls (a modal), not in page flow.
   * External branch only: stay hidden behind a skeleton until a height is
   * messaged (a WikiOui target) — so no ratio box with its own scrollbar
   * flashes before the frame sizes to content — falling back to the ratio box
   * only after a short wait (a non-WikiOui site that never messages).
   */
  sized?: boolean;
  /**
   * Cross-origin only: called with the title a WikiOui target posts by
   * message, so a container with a title bar (ModalLink) can name it — the
   * parent cannot read a cross-origin document.title. Three states:
   * `undefined` while still waiting, the `string` title once it arrives, and
   * `null` when the frame settles without one (a non-WikiOui target) — so the
   * container can fall back to the URL only then, never flashing it first.
   */
  onTitle?: (title: string | null | undefined) => void;
}) {
  const external = isExternalHref(target);
  // A WikiOui embed is the external target an author declares with the
  // /{slug}/iframe suffix (ADR 0022): it alone speaks our postMessage
  // protocol. Any other external URL is a third-party site — no message
  // will come, so it is classified here, up front, and never waits.
  const wikiOuiEmbed = external && /\/iframe(?:[?#]|$)/.test(target);
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
      ? `/${slug}/iframe`
      : null;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  // `sized` only: gives up waiting for a messaged height and reveals the ratio
  // box (a non-WikiOui target never messages).
  const [timedOut, setTimedOut] = useState(false);
  // Internal only: the embedded page's <title>, read same-origin, becomes the
  // frame's accessible name (WCAG H64) when the caller passes none.
  const [docTitle, setDocTitle] = useState<string>();
  // Read inside the message handler, which the [src] effect binds once.
  const onTitleRef = useRef(onTitle);
  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);
  // Whether a title message has arrived for the current target, so the reveal
  // fallback can tell "no title is coming" from "still waiting".
  const titleSeen = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !src) return;
    // A fresh target starts unmeasured so the previous height never lingers.
    setHeight(undefined);
    setDocTitle(undefined);
    setTimedOut(false);
    titleSeen.current = false;
    // A third-party site sends no title, and we know it up front — fall
    // back to the URL at once, no wait. A WikiOui embed keeps waiting.
    onTitleRef.current?.(external && !wikiOuiEmbed ? null : undefined);
    let observer: ResizeObserver | undefined;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    // Same-origin: read the render box directly. Cross-origin: contentDocument
    // access throws, and the postMessage listener below takes over.
    const onLoad = () => {
      // A WikiOui embed messages its height in a beat; wait that beat, then
      // reveal the ratio box as a safety net if the message never comes (an
      // errored page). A third-party site is classified up front and never
      // reaches here. Started on load, not on mount, so a slow network never
      // trips it.
      if (sized && wikiOuiEmbed) {
        if (revealTimer) clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
          setTimedOut(true);
          // The emitter posts the title before the height, so no title by now
          // means none is coming (a non-WikiOui target): let the container
          // fall back to the URL.
          if (!titleSeen.current) onTitleRef.current?.(null);
        }, 600);
      }
      let box: HTMLElement | null = null;
      try {
        setDocTitle(iframe.contentDocument?.title || undefined);
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

    // Cross-origin height and title, only from our own frame. A well-formed
    // number is enough for the height: an absurd value at worst gives an
    // ill-fitting scrollbar, not worth an arbitrary ceiling — but a non-number
    // would collapse the frame.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data as {
        type?: unknown;
        height?: unknown;
        title?: unknown;
      };
      if (!data) return;
      if (data.type === "wikioui:title") {
        if (typeof data.title === "string" && data.title) {
          titleSeen.current = true;
          onTitleRef.current?.(data.title);
        }
        return;
      }
      if (data.type !== "wikioui:resize") return;
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
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [src, sized, external, wikiOuiEmbed]);

  if (!src) return null;

  if (external) {
    // `sized` hides a WikiOui embed behind a skeleton until its height is
    // known (or the safety wait elapses), so no ratio box with its own
    // scrollbar flashes before the frame sizes to content. A third-party
    // site sends no height, so it is not held back — it shows in the ratio
    // box at once. In page flow (not `sized`), the ratio box shows at once too.
    const measuring =
      sized && wikiOuiEmbed && height === undefined && !timedOut;
    return (
      <div>
        {measuring && (
          // A tall placeholder: a well-filled page lands near this height, so
          // it barely resizes on reveal (a short one shrinks — the trade the
          // common case wins). A discreet spinner marks the wait.
          <div className="flex h-[70vh] w-full items-center justify-center rounded-md bg-muted/20">
            <Loader2
              className="size-6 animate-spin text-muted-foreground/50"
              aria-hidden
            />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          title={title || target}
          // ADR 0002: sandbox without allow-top-navigation (an embedded page
          // must not redirect the reader's whole tab), no referrer leak,
          // http(s) only.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          // Lazy only in page flow: a `sized` frame hidden at h-0 would never
          // enter the viewport, so it would never load.
          {...(sized ? {} : { loading: "lazy" as const })}
          // Once a height is messaged in, the frame is sized to its content, so
          // scrolling="no" drops its own bar — the container (a modal, a page)
          // owns the scroll; a fractional box height would otherwise leave a
          // stray inner scrollbar, the same reason the internal branch does it.
          // Unmeasured (a ratio box, a non-WikiOui site), the frame keeps its
          // scroll: its content may exceed the box.
          scrolling={height !== undefined ? "no" : undefined}
          style={height ? { height } : undefined}
          className={cn(
            // No border: an embedded page or site reads flush, without a grey
            // separation around it.
            "w-full bg-background",
            // Hidden while a `sized` frame waits for its height.
            measuring && "invisible h-0",
            // Ratio box while unmeasured, once we are showing the frame.
            height === undefined && !measuring && RATIO_CLASSES[ratio],
            className
          )}
        />
      </div>
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
