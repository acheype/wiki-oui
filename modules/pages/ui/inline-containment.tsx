import type { ReactNode } from "react";

// Keeps an author's literal style={{position:'fixed'}} from escaping an inline
// page render to cover the surface (#29): `contain` makes this box a
// containing block for fixed and absolute descendants, so they resolve against
// it, not the viewport; `isolate` gives it its own stacking context. (Base UI
// portals escape it on purpose.) Its own file, free of the modal host's server
// actions and next/navigation, so a browser test can mount it alone and pin
// the confinement — which no jsdom test can, it needs real layout.
export function InlineContainment({ children }: { children: ReactNode }) {
  return (
    <div className="isolate" style={{ contain: "layout paint" }}>
      {children}
    </div>
  );
}
