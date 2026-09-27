"use client";

import {
  Children,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { childAnchorSlug } from "@/modules/authoring/descriptor";
import { hasWikiComponentName } from "@/modules/authoring/wiki-component";
import { useAnchoredSelection } from "@/modules/pages/anchors/client";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  type CollapsibleColor,
  type CollapsibleDisplay,
  type CollapsibleHeadingLevel,
  type CollapsibleProps,
} from "./collapsible";

export type AccordionDisplay = CollapsibleDisplay;
export type AccordionSpacing = "joined" | "separated";

export type AccordionProps = {
  default?: string;
  toggleIcon?: "chevron" | "plus-minus";
  display?: AccordionDisplay;
  spacing?: AccordionSpacing;
  color?: CollapsibleColor;
  headingLevel?: CollapsibleHeadingLevel;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

type AccordionBlock = {
  slug: string;
  element: ReactElement<CollapsibleProps>;
};

function collectBlocks(children: ReactNode): AccordionBlock[] {
  const blocks: AccordionBlock[] = [];
  const seen = new Set<string>();
  for (const node of Children.toArray(children)) {
    if (
      !isValidElement(node) ||
      (node.type !== Collapsible &&
        !hasWikiComponentName(node, "Collapsible")) ||
      typeof (node.props as Partial<CollapsibleProps>).title !== "string"
    ) {
      continue;
    }
    const element = node as ReactElement<CollapsibleProps>;
    const slug = childAnchorSlug(element.props.title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    blocks.push({ slug, element });
  }
  return blocks;
}

export function Accordion({
  default: defaultSlug,
  toggleIcon = "chevron",
  display = "separators",
  spacing = "joined",
  color,
  headingLevel = "none",
  className,
  style,
  children,
}: AccordionProps) {
  const blocks = collectBlocks(children);
  const slugs = blocks.map((block) => block.slug);
  const initial = defaultSlug && slugs.includes(defaultSlug) ? defaultSlug : null;
  const [openSlug, selectSlug] = useAnchoredSelection(slugs, initial);

  if (blocks.length === 0) return null;

  const separatorDisplay =
    display === "separators" || display === "separators-highlight";
  const resolvedSpacing =
    display === "highlight"
      ? "separated"
      : separatorDisplay
        ? "joined"
        : spacing;
  const resolvedColor = display === "separators" ? undefined : color;

  return (
    <div
      data-slot="accordion"
      className={cn(
        "not-prose my-4",
        resolvedSpacing === "separated" && "grid gap-3",
        className
      )}
      style={style}
    >
      {blocks.map(({ slug, element }, index) => {
        const isOpen = openSlug === slug;
        const joinedClass =
          resolvedSpacing === "joined" && !separatorDisplay
            ? cn(
                "rounded-none",
                index === 0 && "rounded-t-lg",
                index === blocks.length - 1 && "rounded-b-lg",
                index > 0 && "-mt-px"
              )
            : undefined;
        return (
          <Collapsible
            key={slug}
            id={slug}
            title={element.props.title}
            icon={element.props.icon}
            open={isOpen}
            onOpenChange={(next) => {
              selectSlug(next ? slug : null);
            }}
            toggleIcon={toggleIcon}
            display={display}
            color={resolvedColor}
            headingLevel={headingLevel}
            className={cn("my-0 scroll-mt-24", joinedClass, element.props.className)}
            style={element.props.style}
          >
            {element.props.children}
          </Collapsible>
        );
      })}
    </div>
  );
}
