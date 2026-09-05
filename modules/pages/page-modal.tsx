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
import { cn } from "@/lib/utils";

// The one modal of the whole site (ADR 0022): a single <Dialog> hosted here,
// filled inline from a page's RSC body instead of an iframe's second document.
// One host means the "single level" is true by construction — a fiche opened
// from a fiche replaces, never stacks.
//
// The open fiche lives in the URL as ?modale={slug}, written with native
// history.pushState (never router.push): no server round-trip, so the state
// of an <EntriesView> underneath — search, filters, sort, page — survives
// intact, and the modal becomes shareable, back-navigable and reload-proof.
// A hover-triggered modal (<Button popup="hover">) is the one exception: a
// weak intention writes nothing to the URL and opens on local state alone.

type Loaded = { title: string | null; body: ReactNode };

type ModalApi = {
  /** A click: pushes ?modale={slug}, so the modal is shareable and pops on Back. */
  open: (slug: string) => void;
  /** A hover (<Button popup="hover">): opens on local state, no URL entry. */
  openLocal: (slug: string) => void;
  /** Warm the cache ahead of a likely open. */
  preload: (slug: string) => void;
};

// A memory bound, not a freshness policy: wiki content is edited live, but a
// modal reopened within one visit reading a few seconds stale is fine.
const MAX_CACHE = 20;
// A mouse sweeping a table crosses every row; a real aim rests. The delay
// filters the sweep out of preloading better than any cache cap could.
export const HOVER_PRELOAD_MS = 100;

const noop = () => undefined;
const ModalContext = createContext<ModalApi>({
  open: noop,
  openLocal: noop,
  preload: noop,
});

export function useModal(): ModalApi {
  return useContext(ModalContext);
}

// The trigger of an internal modal link (WikiLink target=modal) and of the
// popup <Button>: a real <a href="/{slug}">, so right-click, middle-click and
// Ctrl+click open a tab with no code. A plain click opens the modal instead;
// a hover warms the cache after a short rest — or, for <Button popup="hover">,
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPreload = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <a
      href={`/${slug}`}
      {...rest}
      onClick={(event) => {
        // Leave new-tab / new-window intents to the browser and the real href.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        cancelPreload();
        open(slug);
      }}
      onMouseEnter={() => {
        if (trigger === "hover") {
          openLocal(slug);
        } else {
          cancelPreload();
          timer.current = setTimeout(() => preload(slug), HOVER_PRELOAD_MS);
        }
      }}
      onMouseLeave={cancelPreload}
      onFocus={() => preload(slug)}
      onTouchStart={() => preload(slug)}
    >
      {children}
    </a>
  );
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [urlSlug, setUrlSlug] = useState<string | null>(null);
  const [localSlug, setLocalSlug] = useState<string | null>(null);
  const slug = urlSlug ?? localSlug;

  // The rendered content outlives the close animation: keep it until the
  // dialog is fully gone (the PageEditor motif), so a long fiche does not
  // flash empty on the way out.
  const [current, setCurrent] = useState<(Loaded & { slug: string }) | null>(
    null
  );

  const cache = useRef(new Map<string, Loaded>());
  const inFlight = useRef(new Map<string, Promise<Loaded>>());
  // Did we push a ?modale= entry ourselves? On close, Back pops it; a modal
  // reached by a direct link (nothing of ours below) is stripped in place
  // instead, so closing never walks off the site.
  const pushed = useRef(false);

  const load = useCallback((target: string): Promise<Loaded> => {
    const cached = cache.current.get(target);
    if (cached) return Promise.resolve(cached);
    const pending = inFlight.current.get(target);
    if (pending) return pending;
    const promise = readPageBody(target)
      .then((loaded) => {
        if (cache.current.size >= MAX_CACHE) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined) cache.current.delete(oldest);
        }
        cache.current.set(target, loaded);
        return loaded;
      })
      .finally(() => inFlight.current.delete(target));
    inFlight.current.set(target, promise);
    return promise;
  }, []);

  const preload = useCallback(
    (target: string) => {
      if (isValidSlug(target)) void load(target).catch(() => undefined);
    },
    [load]
  );

  useEffect(() => {
    if (!slug) return; // keep the last content while the dialog closes
    let live = true;
    const cached = cache.current.get(slug);
    if (cached) {
      setCurrent({ slug, ...cached });
      return;
    }
    setCurrent({ slug, title: null, body: null }); // loading
    void load(slug).then(
      (loaded) => live && setCurrent({ slug, ...loaded }),
      () => live && setCurrent({ slug, title: null, body: <LoadFailed /> })
    );
    return () => {
      live = false;
    };
  }, [slug, load]);

  const open = useCallback(
    (target: string) => {
      if (!isValidSlug(target)) return;
      void load(target).catch(() => undefined); // usually warmed by preload
      setLocalSlug(null);
      const params = new URLSearchParams(window.location.search);
      params.set("modale", target);
      pushed.current = true;
      window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    },
    [load]
  );

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
          <DialogTitle
            className={cn(
              "pr-8 text-base",
              !current?.title && "sr-only"
            )}
          >
            {/* A visible stored title (ADR 0020) or leading heading; else the
                slug, sr-only — the page's identity is what a screen reader
                needs to hear when it has no title of its own. */}
            {current?.title ?? current?.slug ?? ""}
          </DialogTitle>
          {current && (
            <>
              {/* contain: the sandbox lets a literal style={{position:'fixed'}}
                  through, which would otherwise cover the whole page. `layout
                  paint` clips it and makes the box the containing block of any
                  `fixed` inside; `isolate` keeps an inner z-index below the
                  overlay (ADR 0022). Radix portals escape the box on purpose. */}
              <div className="isolate" style={{ contain: "layout paint" }}>
                <ModalErrorBoundary resetKey={current.slug}>
                  <Suspense fallback={<BodySkeleton />}>
                    {current.body ?? <BodySkeleton />}
                  </Suspense>
                </ModalErrorBoundary>
              </div>
              {/* Sticky: the body is as tall as the page, so a long one would
                  otherwise push this link out of sight. */}
              <a
                href={`/${current.slug}`}
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
