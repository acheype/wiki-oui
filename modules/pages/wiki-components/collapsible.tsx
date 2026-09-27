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
  | "separators"
  | "separators-highlight";
export type CollapsibleColor =
  | "none"
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "destructive";
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
  none: "border-border",
  primary: "border-primary",
  secondary: "border-secondary",
  success: "border-success",
  info: "border-info",
  warning: "border-warning",
  destructive: "border-destructive",
};

const foregroundColors: Record<CollapsibleColor, string> = {
  none: "text-foreground",
  primary: "text-primary",
  secondary: "text-secondary",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  destructive: "text-destructive",
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
  secondary: {
    background: "bg-secondary-subtle",
    open: "data-open:bg-secondary-subtle",
    hover: "hover:bg-secondary-subtle",
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
  destructive: {
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
  const separatorDisplay =
    display === "separators" || display === "separators-highlight";
  const resolvedColor =
    display === "separators"
      ? "none"
      : color ?? (display === "outline" ? "none" : "primary");
  const highlightedColor = resolvedColor === "none" ? "primary" : resolvedColor;
  const dynamicHighlight =
    display === "outline-highlight" ||
    display === "highlight" ||
    display === "separators-highlight";
  const mutedIndicator =
    separatorDisplay || (display === "outline" && resolvedColor === "none");
  const indicatorColor = mutedIndicator
    ? "text-muted-foreground/60"
    : foregroundColors[resolvedColor];

  const trigger = (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group/trigger flex w-full items-center gap-2 rounded-[inherit] px-4 py-3 text-left font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 motion-reduce:transition-none",
        dynamicHighlight && !open && backgroundColors[highlightedColor].hover
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center text-xl leading-none",
            indicatorColor
          )}
        >
          <Icon id={icon} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-foreground">{title}</span>
      {toggleIcon === "chevron" ? (
        open ? (
          <ChevronUp
            className={cn("size-5 shrink-0 print:hidden", indicatorColor)}
            aria-hidden
          />
        ) : (
          <ChevronDown
            className={cn("size-5 shrink-0 print:hidden", indicatorColor)}
            aria-hidden
          />
        )
      ) : open ? (
        <Minus
          className={cn("size-5 shrink-0 print:hidden", indicatorColor)}
          strokeWidth={2.5}
          aria-hidden
        />
      ) : (
        <Plus
          className={cn("size-5 shrink-0 print:hidden", indicatorColor)}
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
        "not-prose my-4 overflow-hidden transition-colors motion-reduce:transition-none print:border print:border-border print:bg-transparent print:text-foreground",
        display === "separators-highlight" && "group/collapsible",
        separatorDisplay ? "rounded-none" : "rounded-lg",
        display !== "highlight" && !separatorDisplay && "border",
        !separatorDisplay && outlineColors[resolvedColor],
        display === "outline-tinted" &&
          backgroundColors[highlightedColor].background,
        dynamicHighlight && backgroundColors[highlightedColor].open,
        display === "separators-highlight" &&
          "hover:shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)]",
        display === "separators-highlight" &&
          open &&
          "shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)]",
        display === "separators-highlight" &&
          "[&:has(+_[data-slot=collapsible]:hover)>[data-slot=collapsible-separator]]:mx-0 [&:has(+_[data-slot=collapsible][data-open])>[data-slot=collapsible-separator]]:mx-0",
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
      {separatorDisplay && (
        <div
          data-slot="collapsible-separator"
          className={cn(
            "mx-4 border-b border-border",
            display === "separators-highlight" &&
              "group-hover/collapsible:mx-0",
            display === "separators-highlight" && open && "mx-0"
          )}
          aria-hidden
        />
      )}
    </CollapsiblePrimitive.Root>
  );
}
