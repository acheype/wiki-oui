"use client";

import { ChevronDown } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Bouton } from "./bouton";
import { WikiLink } from "./wiki-link";

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
      isValidElement(node) &&
      (node.type === WikiLink ||
        (node.type === Bouton &&
          Boolean((node.props as { lien?: string }).lien)))
  );
  return { label, navigates, children: sublists.flatMap(parseList) };
}

const barItemClass =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

// Reuses the element the registry produced, just restyled for the bar.
function styled(node: ReactNode, className: string): ReactNode {
  if (isValidElement(node) && node.type === WikiLink) {
    const element = node as ElementWithChildren;
    return cloneElement(element, {
      className: cn(className, element.props.className),
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
  if (item.label.length === 1 && isValidElement(node)) {
    if (node.type === Bouton) return node;
    if (node.type === WikiLink) return styled(node, barItemClass);
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
      <DropdownTrigger item={item} open={open} onToggle={() => setOpen(!open)} />
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
  onToggle,
}: {
  item: MenuItem;
  open: boolean;
  onToggle: () => void;
}) {
  const [node] = item.label;
  const isBouton =
    item.label.length === 1 && isValidElement(node) && node.type === Bouton;

  // A navigating trigger keeps its click for navigation (the dropdown opens
  // on hover/focus); a plain one toggles on click.
  if (item.navigates || isBouton) {
    const trigger = isBouton ? node : styled(node, barItemClass);
    return (
      <span
        className="flex items-center"
        onClick={item.navigates ? undefined : onToggle}
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
      onClick={onToggle}
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
    const single = item.label.length === 1 && isValidElement(node);

    let entry: ReactNode;
    if (single && node.type === Bouton) {
      entry = (
        <div className="px-1 py-0.5" style={indent}>
          {node}
        </div>
      );
    } else if (single && node.type === WikiLink) {
      const link = node as ElementWithChildren & ReactElement<{ style?: React.CSSProperties }>;
      entry = cloneElement(link, {
        className: cn(
          "block rounded-sm py-1.5 pr-2 text-sm hover:bg-accent hover:text-accent-foreground",
          link.props.className
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
