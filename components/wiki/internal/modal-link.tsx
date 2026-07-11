"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm font-normal text-muted-foreground">
              {href}
            </DialogTitle>
          </DialogHeader>
          <iframe
            src={href}
            title={href}
            className="h-[70vh] w-full rounded-md border bg-background"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
