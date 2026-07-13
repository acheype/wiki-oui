"use client";

import { useEffect, useState } from "react";

// Debounced, abortable JSON GET shared by the builder's async pickers (icon
// search, file library). Returns undefined until the first success; a null url
// skips fetching (e.g. a closed popover); errors — offline, or aborted by a
// newer url — leave the last value in place so the field degrades gracefully.
export function useDebouncedJson<T>(
  url: string | null,
  debounceMs: number
): T | undefined {
  const [data, setData] = useState<T>();

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        setData((await response.json()) as T);
      } catch {
        // Offline or superseded by a newer url: keep the last value.
      }
    }, debounceMs);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, debounceMs]);

  return data;
}
