"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Tabs as TabsPrimitive,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { childSlug } from "@/modules/authoring/descriptor";
import { cn } from "@/lib/utils";
import type { TabProps } from "./tab";

// Built-in wrapper (ADR 0031): renders the <Tab> children written between its
// tags as a tab group. Config lives in props, content in the children — each
// <Tab> holds arbitrary MDX. Client (Radix + the anchor listener below).
//
// Like <Menu> (menu.tsx), it reads its children by prop shape, not by
// node.type, which breaks across the RSC boundary: a <Tab> is any element
// carrying a `title`. The children keep their own MDX content untouched.

type TabsDisplay = "underline" | "segmented" | "folder" | "separated";

export type TabsProps = {
  display?: TabsDisplay;
  orientation?: "horizontal" | "vertical";
  fullWidth?: boolean;
  /** Slug of the tab open on load; falls back to the first tab. */
  default?: string;
  children?: ReactNode;
};

// underline/segmented come from the primitive; folder and separated are the
// ADR 0031 looks (components/ui/tabs.tsx).
const DISPLAY_VARIANT: Record<
  TabsDisplay,
  "line" | "default" | "folder" | "separated"
> = {
  underline: "line",
  segmented: "default",
  folder: "folder",
  separated: "separated",
};

type Tab = { slug: string; title: string; icon?: string; content: ReactNode };

function isTabElement(node: ReactNode): node is ReactElement<TabProps> {
  return (
    isValidElement(node) &&
    typeof (node.props as Partial<TabProps>).title === "string"
  );
}

// One tab per <Tab> child, slug derived from its title. Duplicate slugs are
// dropped — the first wins — so an anchor names exactly one tab (the builder
// blocks a same-group collision before it is ever saved).
function collectTabs(children: ReactNode): Tab[] {
  const tabs: Tab[] = [];
  const seen = new Set<string>();
  for (const node of Children.toArray(children)) {
    if (!isTabElement(node)) continue;
    const { title, icon, children: content } = node.props;
    const slug = childSlug({ title });
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    tabs.push({ slug, title, icon, content });
  }
  return tabs;
}

export function Tabs({
  display = "segmented",
  orientation = "horizontal",
  fullWidth = false,
  default: defaultSlug,
  children,
}: TabsProps) {
  const tabs = collectTabs(children);
  const slugs = tabs.map((tab) => tab.slug);
  const initial =
    defaultSlug && slugs.includes(defaultSlug) ? defaultSlug : slugs[0];
  const [value, setValue] = useState(initial);

  // A `#slug` anchor opens (and scrolls to) the matching tab (ADR 0031). Each
  // <Tabs> answers only for its own slugs, so several groups on one page do
  // not fight over the hash. hashchange keeps an in-page link working.
  // Joined into one key so the effect re-binds only when the slugs change.
  const slugKey = slugs.join("|");
  useEffect(() => {
    const groupSlugs = slugKey ? slugKey.split("|") : [];
    const applyHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!groupSlugs.includes(hash)) return;
      setValue(hash);
      document.getElementById(hash)?.scrollIntoView({ block: "nearest" });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [slugKey]);

  if (tabs.length === 0) return null;

  const variant = DISPLAY_VARIANT[display];
  // How the panel demarcates its zone, per display:
  // - segmented / separated: a detached thin-bordered card below the tabs (the
  //   root gap sets it off);
  // - folder: no card — a single separator line, the active folder merging into
  //   it. Horizontal takes the line from the tab list's bottom border; vertical
  //   draws it here as the content's left border, which the active tab overlaps;
  // - underline: no box either — the content clears the underline the same way.
  const flowsPast = orientation === "vertical" ? "pl-5" : "pt-5";
  const contentClass =
    display === "folder"
      ? cn(flowsPast, orientation === "vertical" && "border-l")
      : display === "underline"
        ? flowsPast
        : "rounded-lg border p-4";

  return (
    <TabsPrimitive
      value={value}
      onValueChange={setValue}
      orientation={orientation}
      className={cn("not-prose my-4", display === "folder" && "gap-0")}
    >
      <TabsList
        variant={variant}
        className={cn(
          fullWidth && "w-full",
          // The segmented track is a fixed h-9 by default; let its padded pills
          // set a taller height (the wiki wants roomier segments).
          display === "segmented" && "group-data-horizontal/tabs:h-auto"
        )}
      >
        {tabs.map((tab) => (
          // text-base: tab titles match the page's body size, not the
          // primitive's smaller text-sm. Folder tabs stay content-sized on
          // their full-width line unless fullWidth stretches them.
          <TabsTrigger
            key={tab.slug}
            value={tab.slug}
            className={cn(
              "text-base",
              // Roomier segmented pills (px-2/py-1 base is tight); h-auto frees
              // them from the track's fixed height so the padding tells.
              display === "segmented" &&
                "px-3 py-1.5 group-data-horizontal/tabs:h-auto",
              fullWidth ? "flex-1" : display === "folder" ? "flex-none" : undefined
            )}
          >
            {tab.icon && <Icon id={tab.icon} />}
            {tab.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        // text-base lifts the panel off the primitive's text-sm so tab content
        // reads at the page's own size (uniform with the surrounding prose).
        <TabsContent
          key={tab.slug}
          value={tab.slug}
          id={tab.slug}
          className={cn("prose max-w-none scroll-mt-24 text-base", contentClass)}
        >
          {tab.content}
        </TabsContent>
      ))}
    </TabsPrimitive>
  );
}
