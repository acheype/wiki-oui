"use client";

import { ChevronDown } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import type { BoutonProps } from "./bouton";

// Built-in component (ADR 0010): renders the nested list written between its
// tags as a multi-level menu — level 1 as a horizontal bar, level 2 as a
// dropdown, deeper levels flattened (indented) inside the same dropdown.
// Items keep the elements the MDX registry produced (WikiLink, Bouton), so
// link behaviors (modal target, external…) are preserved. Without a list it
// renders nothing: menus are authored, never derived from the database.

type MenuItem = {
  label: ReactNode[];
  /** The label itself navigates (wiki link, or Bouton with a `lien`). */
  navigates: boolean;
  children: MenuItem[];
};

type ElementWithChildren = ReactElement<{ className?: string; children?: ReactNode }>;

function isTag(node: ReactNode, tag: string): node is ElementWithChildren {
  return isValidElement(node) && node.type === tag;
}

// Type identity (node.type === Bouton) breaks across the RSC boundary: the
// flight payload rebuilds client elements with lazy references, so SSR and
// client disagree and hydration fails. Detect the registry components by
// their props instead — the sandbox whitelist (ADR 0002) makes the shapes
// unambiguous: only WikiLink carries `href`, only Bouton its French props.
type LinkElement = ReactElement<{
  className?: string;
  style?: CSSProperties;
  href: string;
}>;

function isComponentElement(
  node: ReactNode
): node is ReactElement<Record<string, unknown>> {
  return isValidElement(node) && typeof node.type !== "string";
}

function isWikiLinkElement(node: ReactNode): node is LinkElement {
  return isComponentElement(node) && typeof node.props.href === "string";
}

function isBoutonElement(node: ReactNode): node is ReactElement<BoutonProps> {
  return (
    isComponentElement(node) &&
    !("href" in node.props) &&
    ("icone" in node.props || "texte" in node.props || "lien" in node.props)
  );
}

function meaningfulChildren(node: ReactNode): ReactNode[] {
  return Children.toArray(node).filter(
    (child) => !(typeof child === "string" && child.trim() === "")
  );
}

function parseList(list: ElementWithChildren): MenuItem[] {
  return meaningfulChildren(list.props.children)
    .filter((child): child is ElementWithChildren => isTag(child, "li"))
    .map(parseItem);
}

function parseItem(li: ElementWithChildren): MenuItem {
  // Loose lists wrap the item's inline content in a paragraph: unwrap it.
  const nodes = meaningfulChildren(li.props.children).flatMap((node) =>
    isTag(node, "p") ? meaningfulChildren(node.props.children) : [node]
  );
  const sublists = nodes.filter(
    (node) => isTag(node, "ul") || isTag(node, "ol")
  ) as ElementWithChildren[];
  const label = nodes.filter((node) => !sublists.includes(node as ElementWithChildren));
  const navigates = label.some(
    (node) =>
      isWikiLinkElement(node) ||
      (isBoutonElement(node) && Boolean(node.props.lien))
  );
  return { label, navigates, children: sublists.flatMap(parseList) };
}

const barItemClass =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

// Reuses the element the registry produced, just restyled for the bar.
function styled(node: ReactNode, className: string): ReactNode {
  if (isWikiLinkElement(node)) {
    return cloneElement(node, {
      className: cn(className, node.props.className),
    });
  }
  return node;
}

export function Menu({ children }: { children?: ReactNode }) {
  const list = meaningfulChildren(children).find(
    (node) => isTag(node, "ul") || isTag(node, "ol")
  ) as ElementWithChildren | undefined;
  if (!list) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {parseList(list).map((item, index) =>
        item.children.length > 0 ? (
          <Dropdown key={index} item={item} />
        ) : (
          <LeafItem key={index} item={item} />
        )
      )}
    </nav>
  );
}

function LeafItem({ item }: { item: MenuItem }) {
  const [node] = item.label;
  if (item.label.length === 1) {
    if (isBoutonElement(node)) return node;
    if (isWikiLinkElement(node)) return styled(node, barItemClass);
  }
  return <span className={cn(barItemClass, "hover:bg-transparent")}>{item.label}</span>;
}

function Dropdown({ item }: { item: MenuItem }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // Small grace delay so the pointer can travel from trigger to panel.
  const hideSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {/* Open, not toggle: hover already opened it, so a toggling click
          would close the panel right away (ADR 0010: "clic pour ouvrir"). */}
      <DropdownTrigger item={item} open={open} onOpen={show} />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <DropdownEntries items={item.children} depth={0} />
        </div>
      )}
    </div>
  );
}

function DropdownTrigger({
  item,
  open,
  onOpen,
}: {
  item: MenuItem;
  open: boolean;
  onOpen: () => void;
}) {
  const [node] = item.label;
  const isBouton = item.label.length === 1 && isBoutonElement(node);

  // A navigating trigger keeps its click for navigation (the dropdown opens
  // on hover/focus); a plain one toggles on click. Any component in the
  // label also takes this branch: it may render interactive markup, which
  // must not be nested inside the <button> below (invalid HTML).
  if (item.navigates || item.label.some(isComponentElement)) {
    const trigger = isBouton ? node : styled(node, barItemClass);
    return (
      <span
        className="flex items-center"
        onClick={item.navigates ? undefined : onOpen}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
        {!isBouton && <Chevron open={open} />}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cn(barItemClass, "flex items-center")}
      onClick={onOpen}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {item.label}
      <Chevron open={open} />
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn("ml-0.5 size-3.5 transition-transform", open && "rotate-180")}
    />
  );
}

// Levels ≥ 3 are flattened: rendered in the same panel, just indented.
function DropdownEntries({ items, depth }: { items: MenuItem[]; depth: number }) {
  return items.map((item, index) => {
    const indent = { paddingLeft: `${0.625 + depth * 0.875}rem` };
    const [node] = item.label;
    const single = item.label.length === 1;

    let entry: ReactNode;
    if (single && isBoutonElement(node)) {
      entry = (
        <div className="px-1 py-0.5" style={indent}>
          {node}
        </div>
      );
    } else if (single && isWikiLinkElement(node)) {
      entry = cloneElement(node, {
        className: cn(
          "block rounded-sm py-1.5 pr-2 text-sm hover:bg-accent hover:text-accent-foreground",
          node.props.className
        ),
        style: indent,
      });
    } else {
      entry = (
        <div
          className="py-1.5 pr-2 text-xs font-medium text-muted-foreground"
          style={indent}
        >
          {item.label}
        </div>
      );
    }

    return (
      <div key={index}>
        {entry}
        {item.children.length > 0 && (
          <DropdownEntries items={item.children} depth={depth + 1} />
        )}
      </div>
    );
  });
}
