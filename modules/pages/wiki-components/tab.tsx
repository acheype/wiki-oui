"use client";

import type { ReactNode } from "react";

// One tab of a <Tabs> wrapper (ADR 0031). A marker child with no descriptor
// of its own: it never inserts alone, so its props are described in tabs.yaml's
// `children:` section, and <Tabs> reads them straight off this element.
//
// Client on purpose: like <Button> (button-view.tsx), a client component keeps
// its props across the RSC boundary, so the client <Tabs> recognizes each
// child by its `title` prop (tabs.tsx) instead of rendering it away. Rendered
// on its own — outside any <Tabs> — it simply shows its content.
export type TabProps = {
  /** Trigger label; also the source of the tab's anchor slug. */
  title: string;
  /** Iconify id shown before the title, e.g. `lucide:info`. */
  icon?: string;
  children?: ReactNode;
};

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}
