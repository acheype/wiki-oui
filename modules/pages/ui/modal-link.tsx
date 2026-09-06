"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WikiFrame } from "@/modules/pages/ui/wiki-frame";
import { cn } from "@/lib/utils";

// Client innard of WikiLink's external modal target — also the external
// <Button> (trigger "hover" opens on mouse-over). An internal target never
// reaches here: it goes through the RSC-inline modal (ModalTrigger, ADR 0022).
// So the frame is always cross-origin and sandboxed.
export function ModalLink({
  href,
  trigger = "click",
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"a"> & {
  href: string;
  trigger?: "click" | "hover";
}) {
  const [open, setOpen] = useState(false);
  // A WikiOui /{slug}/iframe target posts its title (cross-origin); the modal
  // names it in the bar instead of the raw URL. Three states from WikiFrame:
  // `undefined` while waiting (URL kept as the accessible name but hidden, so
  // it never flashes before a title lands), the `string` title once it
  // arrives, and `null` when the frame settled without one (a non-WikiOui
  // target) — then the URL shows. Whether the framed body repeats the title is
  // the author's call: they add ?title=hidden to the URL to drop it (ADR 0022).
  const [title, setTitle] = useState<string | null>();

  return (
    <>
      <a
        href={href}
        {...rest}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        onMouseEnter={trigger === "hover" ? () => setOpen(true) : undefined}
      >
        {children}
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* As wide as the page's content column (max-w-5xl in the site
            layout): the target must read as it reads on its own page. Height
            follows the frame, capped so a long page scrolls inside the modal. */}
        <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            {/* While waiting (undefined), the URL stays the accessible name
                but hidden, so a WikiOui title arriving a beat later never
                visibly replaces it. It shows only once the frame settles
                without a title (null): a non-WikiOui target. */}
            <DialogTitle
              className={cn(
                "truncate pr-6",
                typeof title === "string"
                  ? "text-base"
                  : title === null
                    ? "text-sm font-normal text-muted-foreground"
                    : "sr-only"
              )}
            >
              {title || href}
            </DialogTitle>
          </DialogHeader>
          <WikiFrame target={href} onTitle={setTitle} sized />
        </DialogContent>
      </Dialog>
    </>
  );
}
