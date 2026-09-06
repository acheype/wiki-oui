"use client";

import {
  Component,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { readPageBody } from "@/modules/pages/content-actions";
import { isValidSlug } from "@/lib/slug";

// The one modal of the whole site (ADR 0022): a single <Dialog> hosted here,
// filled inline from a page's RSC body instead of an iframe's second document.
// One host means the "single level" is true by construction — a fiche opened
// from a fiche replaces, never stacks.
//
// The open fiche lives in the URL as ?modale={slug}, written with native
// history.pushState (never router.push): no server round-trip, so the state
// of an <EntriesView> underneath — search, filters, sort, page — survives
// intact, and the modal becomes shareable, back-navigable and reload-proof.
// A hover-triggered modal (<Button modal="hover">) is the one exception: a
// weak intention writes nothing to the URL and opens on local state alone.

type Loaded = { title: string | null; body: ReactNode };

type ModalApi = {
  /** A click: pushes ?modale={slug}, so the modal is shareable and pops on Back. */
  open: (slug: string) => void;
  /** A hover (<Button modal="hover">): opens on local state, no URL entry. */
  openLocal: (slug: string) => void;
  /** Warm the cache ahead of a likely open. */
  preload: (slug: string) => void;
};

const MAX_CACHE = 20;
// A mouse sweeping a table crosses every row; a real aim rests. The delay
// filters the sweep out of preloading better than any cache cap could.
export const HOVER_PRELOAD_MS = 100;

// One cache for the whole tab, shared by the modal host and every inline
// surface (the unfolded Liste row, the Carte panel, the editor cheat sheet):
// a hover that warms it pays off wherever the fiche is next shown. Capped as
// a memory bound, not a freshness policy — wiki content is edited live, but a
// body reread seconds stale within one visit is fine.
const bodyCache = new Map<string, Loaded>();
const inFlight = new Map<string, Promise<Loaded>>();

function loadPageBody(slug: string): Promise<Loaded> {
  const cached = bodyCache.get(slug);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(slug);
  if (pending) return pending;
  const promise = readPageBody(slug)
    .then((loaded) => {
      if (bodyCache.size >= MAX_CACHE) {
        const oldest = bodyCache.keys().next().value;
        if (oldest !== undefined) bodyCache.delete(oldest);
      }
      bodyCache.set(slug, loaded);
      return loaded;
    })
    .finally(() => inFlight.delete(slug));
  inFlight.set(slug, promise);
  return promise;
}

const noop = () => undefined;
const ModalContext = createContext<ModalApi>({
  open: noop,
  openLocal: noop,
  preload: noop,
});

export function useModal(): ModalApi {
  return useContext(ModalContext);
}

// Hover/focus/touch handlers that warm the modal cache for one target, with
// the mouse-sweep debounce (ADR 0022): a pointer crossing a table's rows rests
// nowhere long enough to fire a read, a real aim does. Focus and touch are
// explicit intentions, so they warm at once. Shared by ModalTrigger's click
// path and by every <EntriesView> row that opens the modal.
export function usePreloadHandlers(preload: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    onMouseEnter: () => {
      cancel();
      timer.current = setTimeout(preload, HOVER_PRELOAD_MS);
    },
    onMouseLeave: cancel,
    onFocus: preload,
    onTouchStart: preload,
  };
}

// The trigger of an internal modal link (WikiLink target=modal) and of the
// modal <Button>: a real <a href="/{slug}">, so right-click, middle-click and
// Ctrl+click open a tab with no code. A plain click opens the modal instead;
// a hover warms the cache after a short rest — or, for <Button modal="hover">,
// opens the modal on local state without touching the URL (ADR 0022).
export function ModalTrigger({
  slug,
  trigger = "click",
  children,
  ...rest
}: Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
  slug: string;
  trigger?: "click" | "hover";
}) {
  const { open, openLocal, preload } = useModal();
  const preloadHandlers = usePreloadHandlers(() => preload(slug));
  // A hover trigger opens on mouse-over (local, no URL); a click trigger warms
  // the cache on the same event instead.
  const handlers =
    trigger === "hover"
      ? { ...preloadHandlers, onMouseEnter: () => openLocal(slug) }
      : preloadHandlers;

  return (
    <a
      href={`/${slug}`}
      {...rest}
      {...handlers}
      onClick={(event) => {
        // Leave new-tab / new-window intents to the browser and the real href.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        open(slug);
      }}
    >
      {children}
    </a>
  );
}

// Loads a page's inline body (and title) once, reusing the shared cache a
// hover may have warmed; null until the target's own load resolves. The
// inline counterpart of the modal host, for a surface that shows a page in
// place: the unfolded Liste row, the Carte panel, the editor cheat sheet.
export function usePageBody(
  slug: string | null
): (Loaded & { slug: string }) | null {
  const [resolved, setResolved] = useState<(Loaded & { slug: string }) | null>(
    null
  );
  useEffect(() => {
    // A cache hit is read synchronously below, so the effect only fetches a
    // miss — and only setState in the async callback, never in its body.
    if (!slug || bodyCache.has(slug)) return;
    let live = true;
    void loadPageBody(slug).then(
      (loaded) => live && setResolved({ slug, ...loaded }),
      () => live && setResolved({ slug, title: null, body: <LoadFailed /> })
    );
    return () => {
      live = false;
    };
  }, [slug]);

  if (!slug) return null;
  const cached = bodyCache.get(slug);
  if (cached) return { slug, ...cached };
  return resolved?.slug === slug ? resolved : null;
}

// A page shown in place, chrome-free (ADR 0022): the same RSC body as the
// modal, streamed under an error boundary, wrapped in the containment that
// keeps an author's literal style={{position:'fixed'}} from covering the
// surface (Radix portals escape it on purpose).
export function InlinePageBody({ slug }: { slug: string }) {
  const loaded = usePageBody(slug);
  return (
    <div className="isolate" style={{ contain: "layout paint" }}>
      {loaded ? (
        <ModalErrorBoundary resetKey={slug}>
          <Suspense fallback={<BodySkeleton />}>{loaded.body}</Suspense>
        </ModalErrorBoundary>
      ) : (
        <BodySkeleton />
      )}
    </div>
  );
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [urlSlug, setUrlSlug] = useState<string | null>(null);
  const [localSlug, setLocalSlug] = useState<string | null>(null);
  const slug = urlSlug ?? localSlug;

  // The last slug shown outlives the close animation (the PageEditor motif):
  // captured in render — a primitive, so no update loop — and kept resolving
  // while the dialog fades, so a long fiche never flashes empty on the way
  // out. Cache hits show at once; a miss falls to a skeleton in the body.
  const [shownSlug, setShownSlug] = useState<string | null>(null);
  if (slug !== null && slug !== shownSlug) setShownSlug(slug);
  const shown = usePageBody(shownSlug);

  // Did we push a ?modale= entry ourselves? On close, Back pops it; a modal
  // reached by a direct link (nothing of ours below) is stripped in place
  // instead, so closing never walks off the site.
  const pushed = useRef(false);

  const preload = useCallback((target: string) => {
    if (isValidSlug(target)) void loadPageBody(target).catch(() => undefined);
  }, []);

  const open = useCallback((target: string) => {
    if (!isValidSlug(target)) return;
    void loadPageBody(target).catch(() => undefined); // usually warmed already
    setLocalSlug(null);
    const params = new URLSearchParams(window.location.search);
    params.set("modale", target);
    pushed.current = true;
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
  }, []);

  const openLocal = useCallback((target: string) => {
    if (isValidSlug(target)) setLocalSlug(target);
  }, []);

  const close = useCallback(() => {
    setLocalSlug(null);
    if (!urlSlug) return; // a hover-opened modal holds nothing in the URL
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      const params = new URLSearchParams(window.location.search);
      params.delete("modale");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (query ? `?${query}` : "")
      );
    }
  }, [urlSlug]);

  const api = useMemo<ModalApi>(
    () => ({ open, openLocal, preload }),
    [open, openLocal, preload]
  );

  return (
    <ModalContext.Provider value={api}>
      {children}
      {/* useSearchParams needs a Suspense boundary; confine it to this leaf so
          it never de-opts the page beneath into client rendering. */}
      <Suspense fallback={null}>
        <ModalUrlSync onSlug={setUrlSlug} />
      </Suspense>
      <Dialog open={slug !== null} onOpenChange={(next) => !next && close()}>
        {/* As wide as the page's content column (max-w-5xl in the site
            layout): a fiche reads in the modal much as on its own page. */}
        <DialogContent className="max-h-[85vh] gap-2 overflow-y-auto sm:max-w-5xl">
          {/* A stored title (ADR 0020) or leading heading, else the slug —
              either way the page's identity, so shown large like an h1 of its
              own. ModalLink names a WikiOui target the same way; only a bare
              external URL (no slug) drops to its muted tier. */}
          <DialogTitle className="truncate pr-8 text-lg font-semibold">
            {shown?.title ?? shownSlug ?? ""}
          </DialogTitle>
          {shownSlug && (
            <>
              {/* The body, error boundary and containment are InlinePageBody's:
                  the modal shows a page in place exactly as the other inline
                  surfaces do. The title above is resolved from the same cached
                  read (usePageBody(shownSlug)). */}
              <InlinePageBody slug={shownSlug} />
              {/* Sticky: the body is as tall as the page, so a long one would
                  otherwise push this link out of sight. */}
              <a
                href={`/${shownSlug}`}
                className="sticky -bottom-2 -mx-6 -mb-6 flex items-center gap-1 border-t bg-popover px-6 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Ouvrir la page
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ModalContext.Provider>
  );
}

// The URL is the source of truth for a clicked-open modal. Isolated here so
// useSearchParams sits under its own Suspense boundary (Next requirement)
// without wrapping the page content the provider also renders.
function ModalUrlSync({ onSlug }: { onSlug: (slug: string | null) => void }) {
  const params = useSearchParams();
  const raw = params.get("modale");
  const slug = raw && isValidSlug(raw) ? raw : null;
  useEffect(() => {
    onSlug(slug);
  }, [slug, onSlug]);
  return null;
}

function BodySkeleton() {
  return (
    <div className="grid gap-2 py-2" aria-busy>
      <div className="h-6 w-2/3 animate-pulse rounded bg-muted/60" />
      <div className="h-4 animate-pulse rounded bg-muted/40" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
    </div>
  );
}

function LoadFailed() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Cette page n&apos;a pas pu être chargée.
    </p>
  );
}

// A malformed template makes renderMdx throw while the body streams: without
// a boundary the whole modal would fail to open. Keyed on the slug so a new
// fiche gets a fresh boundary after a previous one errored.
class ModalErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Cette page n&apos;a pas pu être affichée.
        </p>
      );
    }
    return this.props.children;
  }
}
