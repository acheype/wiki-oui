"use client";

import { useEffect, useState } from "react";

// Client icon of the ADR 0013 hybrid: fetches its SVG from GET /api/icons/[id]
// and injects it, so a component using an icon can be a client component
// without bundling the Iconify sets (server components inline iconSvg()
// instead). The module-level cache dedupes: an id is fetched once, then reused
// across every <Icon> on the page and across renders.
const cache = new Map<string, Promise<string | null>>();

function loadIcon(id: string): Promise<string | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  // A missing icon (404) resolves to null and stays cached — icons are
  // immutable. A transient network failure rejects and is evicted, so a later
  // mount retries instead of blanking that icon for the page's lifetime.
  const pending = fetch(`/api/icons/${encodeURIComponent(id)}`).then(
    (response) => (response.ok ? response.text() : null)
  );
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

export function Icon({ id }: { id: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadIcon(id)
      .then((markup) => {
        if (active) setSvg(markup);
      })
      .catch(() => {
        // Transient failure: leave the icon empty; a later mount retries.
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (svg === null) return null;
  // Mirrors the server inline markup (lib/icons.ts): a <span> wrapping the
  // 1em <svg>, which the consumer (e.g. the shadcn button) sizes.
  return <span aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
