"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type CollapsibleDisplay =
  | "outline"
  | "outline-tinted"
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

const backgroundColors: Record<Exclude<CollapsibleColor, "none">, string> = {
  default: "bg-foreground/10",
  primary: "bg-primary/10",
  "secondary-1": "bg-secondary-foreground/10",
  "secondary-2": "bg-secondary-2/10",
  success: "bg-success/10",
  info: "bg-info/10",
  warning: "bg-warning/10",
  danger: "bg-destructive/10",
};

const openBackgroundColors: Record<Exclude<CollapsibleColor, "none">, string> = {
  default: "data-open:bg-foreground/10",
  primary: "data-open:bg-primary/10",
  "secondary-1": "data-open:bg-secondary-foreground/10",
  "secondary-2": "data-open:bg-secondary-2/10",
  success: "data-open:bg-success/10",
  info: "data-open:bg-info/10",
  warning: "data-open:bg-warning/10",
  danger: "data-open:bg-destructive/10",
};

const hoverBackgroundColors: Record<Exclude<CollapsibleColor, "none">, string> = {
  default: "hover:bg-foreground/10",
  primary: "hover:bg-primary/10",
  "secondary-1": "hover:bg-secondary-foreground/10",
  "secondary-2": "hover:bg-secondary-2/10",
  success: "hover:bg-success/10",
  info: "hover:bg-info/10",
  warning: "hover:bg-warning/10",
  danger: "hover:bg-destructive/10",
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
  const [open, setOpen] = useState(defaultOpen);
  const resolvedColor = color ?? (display === "outline" ? "none" : "default");
  const highlightedColor = resolvedColor === "none" ? "default" : resolvedColor;
  const dynamicHighlight =
    display === "outline-highlight" || display === "highlight";

  const trigger = (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group/trigger flex w-full items-center gap-2 rounded-[inherit] px-4 py-3 text-left font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 motion-reduce:transition-none",
        dynamicHighlight && !open && hoverBackgroundColors[highlightedColor]
      )}
    >
      {icon && (
        <span className="flex size-5 shrink-0 items-center justify-center text-xl leading-none">
          <Icon id={icon} />
        </span>
      )}
      <span className="min-w-0 flex-1">{title}</span>
      {toggleIcon === "chevron" ? (
        open ? (
          <ChevronUp className="size-5 shrink-0 print:hidden" aria-hidden />
        ) : (
          <ChevronDown className="size-5 shrink-0 print:hidden" aria-hidden />
        )
      ) : open ? (
        <Minus
          className="size-5 shrink-0 print:hidden"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : (
        <Plus
          className="size-5 shrink-0 print:hidden"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
    </CollapsiblePrimitive.Trigger>
  );

  const Heading = headingLevel === "none" ? null : (headingLevel as ElementType);

  return (
    <CollapsiblePrimitive.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "not-prose my-4 overflow-hidden rounded-lg transition-colors motion-reduce:transition-none print:border print:border-border print:bg-transparent print:text-foreground",
        display !== "highlight" && "border",
        outlineColors[resolvedColor],
        display === "outline-tinted" && backgroundColors[highlightedColor],
        dynamicHighlight && openBackgroundColors[highlightedColor],
        className
      )}
      style={style}
    >
      {Heading ? <Heading className="m-0 text-base">{trigger}</Heading> : trigger}
      <CollapsiblePrimitive.Panel
        hiddenUntilFound
        className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none print:block! print:h-auto! print:opacity-100! print:[content-visibility:visible]!"
      >
        <div className="prose max-w-none px-4 pb-4 text-foreground">{children}</div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
