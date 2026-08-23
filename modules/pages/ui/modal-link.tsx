"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WikiFrame } from "@/modules/pages/wiki-frame";

// Client innard of WikiLink's modal target — also the popup rendering of
// <Button> (trigger "hover" opens on mouse-over).
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
            <DialogTitle className="truncate pr-6 text-sm font-normal text-muted-foreground">
              {href}
            </DialogTitle>
          </DialogHeader>
          {/* An internal href loads the chrome-free /{slug}/iframe render (no
              duplicate top bar, no "Modifier/Supprimer"); an external URL is
              sandboxed at its ratio. */}
          <WikiFrame target={href} />
        </DialogContent>
      </Dialog>
    </>
  );
}
