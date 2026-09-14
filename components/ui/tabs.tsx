"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=folder]:rounded-none data-[variant=separated]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        // Folder tabs (ADR 0031): tabbed folders on a separator line, the active
        // folder merging into it (wiki wrapper joins them, gap-0). The list
        // carries the line on its own border, overlapped by the active tab (a
        // child over its parent's border); the leading pad shows a segment
        // before the first tab. Horizontal: the full-width bottom border.
        // Vertical: the right border — as a flex-row item the list stretches to
        // the content's height, so the line runs the full height. h-auto lets
        // padding set height.
        folder:
          "items-end justify-start gap-1 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto group-data-horizontal/tabs:w-full group-data-horizontal/tabs:border-b group-data-horizontal/tabs:pl-6 group-data-vertical/tabs:h-auto group-data-vertical/tabs:items-stretch group-data-vertical/tabs:border-r group-data-vertical/tabs:pt-1.5",
        // Separated tabs (ADR 0031): loose pills on no track — the active one a
        // solid filled pill, the rest plain text. Vertical stacks them left.
        separated:
          "h-auto gap-1.5 rounded-none bg-transparent p-0 group-data-vertical/tabs:items-start",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  // WikiOui's choice over Base UI's default: an arrow key activates the tab
  // it lands on, not only focuses it.
  activateOnFocus = true,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      activateOnFocus={activateOnFocus}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Base. h-auto in vertical: the horizontal h-[calc(100%-1px)] would
        // pin a stacked tab's height and swallow its padding, so vertical tabs
        // take their height from their own py instead.
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:h-auto group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Underline look: plain text on a transparent track. The grey hover
        // pill and the underline bar are drawn once, as sliding indicators, by
        // the wiki wrapper (wiki-components/tabs/underline-indicators.tsx) — not
        // per tab here — so this variant only styles the text.
        "group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:py-1.5 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-foreground dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        // Folder look: a grey bordered tab reaching one pixel onto the list's
        // separator line, so the active tab's white border hides that segment
        // and it reads as continuous with the content beyond. Horizontal pulls
        // the tab down onto the bottom line with -mb-px. Vertical cannot use a
        // negative margin: the tab's cross size is pinned by w-full and the
        // margin box governs placement, so -mr-px would just shift it back —
        // it grows the width by a pixel to land on the right line instead.
        "group-data-[variant=folder]/tabs-list:border-border group-data-[variant=folder]/tabs-list:bg-muted group-data-[variant=folder]/tabs-list:px-3 group-data-[variant=folder]/tabs-list:py-1.5 group-data-[variant=folder]/tabs-list:text-foreground/70 group-data-[variant=folder]/tabs-list:after:hidden group-data-[variant=folder]/tabs-list:data-active:bg-background group-data-[variant=folder]/tabs-list:data-active:text-foreground group-data-[variant=folder]/tabs-list:data-active:shadow-none",
        "group-data-[variant=folder]/tabs-list:group-data-horizontal/tabs:rounded-b-none group-data-[variant=folder]/tabs-list:group-data-horizontal/tabs:-mb-px group-data-[variant=folder]/tabs-list:group-data-horizontal/tabs:data-active:border-b-background",
        "group-data-[variant=folder]/tabs-list:group-data-vertical/tabs:rounded-r-none group-data-[variant=folder]/tabs-list:group-data-vertical/tabs:w-[calc(100%+1px)] group-data-[variant=folder]/tabs-list:group-data-vertical/tabs:py-3 group-data-[variant=folder]/tabs-list:group-data-vertical/tabs:data-active:border-r-background",
        // Separated look: a loose pill per tab; the active one filled solid
        // (foreground on background), the rest plain text.
        "group-data-[variant=separated]/tabs-list:px-3 group-data-[variant=separated]/tabs-list:py-1.5 group-data-[variant=separated]/tabs-list:after:hidden group-data-[variant=separated]/tabs-list:data-active:border-transparent group-data-[variant=separated]/tabs-list:data-active:bg-foreground group-data-[variant=separated]/tabs-list:data-active:text-background group-data-[variant=separated]/tabs-list:data-active:shadow-none dark:group-data-[variant=separated]/tabs-list:data-active:border-transparent dark:group-data-[variant=separated]/tabs-list:data-active:bg-foreground dark:group-data-[variant=separated]/tabs-list:data-active:text-background",
        className
      )}
      {...props}
    />
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={className}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsIndicator,
  TabsContent,
  tabsListVariants,
}
