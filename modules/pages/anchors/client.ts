"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Current decoded fragment, or an empty string when it cannot be decoded. */
export function currentAnchor(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

/** Replaces the fragment without adding a browser-history entry. */
export function replaceAnchor(anchor?: string): void {
  const url = `${window.location.pathname}${window.location.search}${
    anchor ? `#${encodeURIComponent(anchor)}` : ""
  }`;
  window.history.replaceState(window.history.state, "", url);
}

/** Selection state synchronized with a page fragment and its rendered target. */
export function useAnchoredSelection(
  slugs: string[],
  initial: string | null
): [string | null, (next: string | null) => void] {
  const [selected, setSelected] = useState<string | null>(initial);
  const pendingScroll = useRef<string | null>(null);
  const slugKey = slugs.join("|");

  useEffect(() => {
    const available = slugKey ? slugKey.split("|") : [];
    const applyHash = () => {
      const hash = currentAnchor();
      if (!available.includes(hash)) return;
      setSelected(hash);
      const target = document.getElementById(hash);
      if (target) target.scrollIntoView({ block: "nearest" });
      else pendingScroll.current = hash;
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [slugKey]);

  useEffect(() => {
    const target = pendingScroll.current;
    if (target === null || target !== selected) return;
    pendingScroll.current = null;
    document.getElementById(target)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const select = useCallback(
    (next: string | null) => {
      setSelected(next);
      if (next) replaceAnchor(next);
      else if (selected && currentAnchor() === selected) replaceAnchor();
    },
    [selected]
  );

  return [selected, select];
}
