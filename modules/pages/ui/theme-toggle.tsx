"use client";

import { Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// A browser preference, not authored page content. The whole menu row is the
// switch so pointer and keyboard users get the same generous target.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot
  );
  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      disabled={!mounted}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "flex w-full min-w-44 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-foreground outline-none",
        "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60"
      )}
    >
      <Moon aria-hidden className="size-4 text-muted-foreground" />
      <span>Thème sombre</span>
      <span
        aria-hidden
        className={cn(
          "ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors",
          dark ? "bg-secondary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "block size-4 rounded-full bg-background shadow-sm transition-transform",
            dark && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}
