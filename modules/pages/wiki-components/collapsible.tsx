"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type CollapsibleDisplay =
  | "outline"
  | "outline-highlight"
  | "highlight";
export type CollapsibleColor =
  | "none"
  | "default"
  | "primary"
  | "secondary-1"
  | "secondary-2"
  | "success"
  | "info"
  | "warning"
  | "danger";
export type CollapsibleHeadingLevel = "none" | "h2" | "h3" | "h4" | "h5" | "h6";

export type CollapsibleProps = {
  title: string;
  defaultOpen?: boolean;
  icon?: string;
  toggleIcon?: "chevron" | "plus-minus";
  display?: CollapsibleDisplay;
  color?: CollapsibleColor;
  headingLevel?: CollapsibleHeadingLevel;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const outlineColors: Record<CollapsibleColor, string> = {
  none: "border-border text-foreground",
  default: "border-foreground text-foreground",
  primary: "border-primary text-primary",
  "secondary-1": "border-secondary-foreground text-secondary-foreground",
  "secondary-2": "border-secondary-2 text-secondary-2",
  success: "border-success text-success",
  info: "border-info text-info",
  warning: "border-warning text-warning",
  danger: "border-destructive text-destructive",
};

const highlightColors: Record<Exclude<CollapsibleColor, "none">, string> = {
  default:
    "data-open:bg-accent data-open:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
  primary:
    "data-open:bg-primary data-open:text-primary-foreground hover:bg-primary hover:text-primary-foreground",
  "secondary-1":
    "data-open:bg-secondary data-open:text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground",
  "secondary-2":
    "data-open:bg-secondary-2 data-open:text-secondary-2-foreground hover:bg-secondary-2 hover:text-secondary-2-foreground",
  success:
    "data-open:bg-success data-open:text-success-foreground hover:bg-success hover:text-success-foreground",
  info:
    "data-open:bg-info data-open:text-info-foreground hover:bg-info hover:text-info-foreground",
  warning:
    "data-open:bg-warning data-open:text-warning-foreground hover:bg-warning hover:text-warning-foreground",
  danger:
    "data-open:bg-destructive data-open:text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
};

export function Collapsible({
  title,
  defaultOpen = false,
  icon,
  toggleIcon = "chevron",
  display = "outline",
  color,
  headingLevel = "none",
  className,
  style,
  children,
}: CollapsibleProps) {
  const resolvedColor = color ?? (display === "outline" ? "none" : "default");
  const highlightedColor = resolvedColor === "none" ? "default" : resolvedColor;

  const trigger = (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group/trigger flex w-full items-center gap-2 rounded-[inherit] px-4 py-3 text-left font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        display !== "outline" && highlightColors[highlightedColor]
      )}
    >
      {icon && <Icon id={icon} />}
      <span className="min-w-0 flex-1">{title}</span>
      {toggleIcon === "chevron" ? (
        <ChevronRight
          className="size-4 shrink-0 transition-transform duration-200 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none print:hidden"
          aria-hidden
        />
      ) : (
        <span className="relative size-4 shrink-0 text-center leading-4 print:hidden" aria-hidden>
          <span className="group-data-panel-open/trigger:hidden">+</span>
          <span className="hidden group-data-panel-open/trigger:inline">−</span>
        </span>
      )}
    </CollapsiblePrimitive.Trigger>
  );

  const Heading = headingLevel === "none" ? null : (headingLevel as ElementType);

  return (
    <CollapsiblePrimitive.Root
      defaultOpen={defaultOpen}
      className={cn(
        "not-prose my-4 overflow-hidden rounded-lg transition-colors motion-reduce:transition-none print:border print:border-border print:bg-transparent print:text-foreground",
        display !== "highlight" && "border",
        display === "outline"
          ? outlineColors[resolvedColor]
          : highlightColors[highlightedColor],
        className
      )}
      style={style}
    >
      {Heading ? <Heading className="m-0 text-base">{trigger}</Heading> : trigger}
      <CollapsiblePrimitive.Panel
        hiddenUntilFound
        className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none print:!block print:!h-auto print:!opacity-100"
      >
        <div className="prose max-w-none px-4 pb-4 text-foreground">{children}</div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
