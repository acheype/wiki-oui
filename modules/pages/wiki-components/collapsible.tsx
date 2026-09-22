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
  | "highlight"
  | "separators";
export type CollapsibleColor =
  | "none"
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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: string;
  toggleIcon?: "chevron" | "plus-minus";
  display?: CollapsibleDisplay;
  color?: CollapsibleColor;
  headingLevel?: CollapsibleHeadingLevel;
  className?: string;
  style?: CSSProperties;
  id?: string;
  children?: ReactNode;
};

const outlineColors: Record<CollapsibleColor, string> = {
  none: "border-border text-foreground",
  primary: "border-primary text-primary",
  "secondary-1": "border-secondary-1 text-secondary-1",
  "secondary-2": "border-secondary-2 text-secondary-2",
  success: "border-success text-success",
  info: "border-info text-info",
  warning: "border-warning text-warning",
  danger: "border-destructive text-destructive",
};

const backgroundColors: Record<
  Exclude<CollapsibleColor, "none">,
  { background: string; open: string; hover: string }
> = {
  primary: {
    background: "bg-primary-subtle",
    open: "data-open:bg-primary-subtle",
    hover: "hover:bg-primary-subtle",
  },
  "secondary-1": {
    background: "bg-secondary-1-subtle",
    open: "data-open:bg-secondary-1-subtle",
    hover: "hover:bg-secondary-1-subtle",
  },
  "secondary-2": {
    background: "bg-secondary-2-subtle",
    open: "data-open:bg-secondary-2-subtle",
    hover: "hover:bg-secondary-2-subtle",
  },
  success: {
    background: "bg-success-subtle",
    open: "data-open:bg-success-subtle",
    hover: "hover:bg-success-subtle",
  },
  info: {
    background: "bg-info-subtle",
    open: "data-open:bg-info-subtle",
    hover: "hover:bg-info-subtle",
  },
  warning: {
    background: "bg-warning-subtle",
    open: "data-open:bg-warning-subtle",
    hover: "hover:bg-warning-subtle",
  },
  danger: {
    background: "bg-destructive-subtle",
    open: "data-open:bg-destructive-subtle",
    hover: "hover:bg-destructive-subtle",
  },
};

export function Collapsible({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  icon,
  toggleIcon = "chevron",
  display = "outline",
  color,
  headingLevel = "none",
  className,
  style,
  id,
  children,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const resolvedColor =
    display === "separators"
      ? "none"
      : color ?? (display === "outline" ? "none" : "primary");
  const highlightedColor = resolvedColor === "none" ? "primary" : resolvedColor;
  const dynamicHighlight =
    display === "outline-highlight" || display === "highlight";

  const trigger = (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group/trigger flex w-full items-center gap-2 rounded-[inherit] px-4 py-3 text-left font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 motion-reduce:transition-none",
        dynamicHighlight && !open && backgroundColors[highlightedColor].hover
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
      id={id}
      data-slot="collapsible"
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "not-prose my-4 overflow-hidden rounded-lg transition-colors motion-reduce:transition-none print:border print:border-border print:bg-transparent print:text-foreground",
        display !== "highlight" && display !== "separators" && "border",
        outlineColors[resolvedColor],
        display === "outline-tinted" &&
          backgroundColors[highlightedColor].background,
        dynamicHighlight && backgroundColors[highlightedColor].open,
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
