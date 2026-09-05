import { useRef } from "react";
import { HOVER_PRELOAD_MS } from "@/modules/pages/page-modal";

// Hover/focus/touch handlers that warm the modal cache for one entry, with
// the mouse-sweep debounce (ADR 0022): a pointer crossing a table's rows
// rests nowhere long enough to fire a read, a real aim does. Focus and touch
// are explicit intentions, so they warm immediately.
export function useRowPreload(preload: () => void) {
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
