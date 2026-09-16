"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogCloseButton className="absolute top-4 right-4" />
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// The one close cross, so every dialog wears it the same: a ghost icon button
// carrying « Fermer » for hover and screen reader alike. `className` places it —
// pinned in a corner for the standard dialog, in flow on a custom header row
// (modules/pages/page-modal.tsx). Self-contained (its own TooltipProvider), so
// a caller drops it in without wiring one.
function DialogCloseButton({ className }: { className?: string }) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fermer"
                  className={className}
                />
              }
            />
          }
        >
          <XIcon className="size-5" />
        </TooltipTrigger>
        <TooltipContent>Fermer</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// An icon-only action in a dialog's title bar: a real <a href> — so middle-
// click and Ctrl+click still open a tab — styled as a ghost icon button, its
// label read out by a tooltip. `newTab` opens a third-party target in a new
// tab. Needs a TooltipProvider ancestor; DialogTitleBar wraps the group.
function DialogIconLink({
  href,
  label,
  icon,
  newTab = false,
}: {
  href: string
  label: string
  icon: React.ReactNode
  newTab?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            aria-label={label}
            {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// The shared modal title bar (ADR 0022): the page's or target's name, an
// optional group of icon actions, a hairline, then the shared close cross — so
// every modal that carries a header wears the same one. Actions sit in a
// TooltipProvider here, so a caller passes bare DialogIconLinks. The title's
// size/weight is the caller's (a resolved title reads as an h1, a bare URL
// stays muted), on top of the shared truncate.
function DialogTitleBar({
  children,
  titleClassName,
  actions,
}: {
  children: React.ReactNode
  titleClassName?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1 border-b px-6 py-2.5">
      {/* The title keeps its flex-1 box even while it is visually hidden — a
          framed target whose title has not been messaged yet (sr-only) — so
          the actions and the close never drift left waiting for it to land. */}
      <div className="min-w-0 flex-1 pr-2">
        <DialogTitle className={cn("truncate", titleClassName)}>
          {children}
        </DialogTitle>
      </div>
      {actions && (
        <TooltipProvider delay={300}>{actions}</TooltipProvider>
      )}
      {/* A hairline sets the close apart: leaving the modal is not one of the
          actions on its content. */}
      <div className="mx-1 h-6 w-px bg-border" aria-hidden />
      <DialogCloseButton />
    </div>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogIconLink,
  DialogTitleBar,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
