"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogIconLink,
  DialogTitleBar,
} from "@/components/ui/dialog";
import { WikiFrame } from "@/modules/pages/ui/wiki-frame";

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
            layout): the target must read as it reads on its own page.
            overflow-hidden keeps the rounded corners intact while the frame
            below scrolls; the title bar stays put. */}
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          {/* No wiki page actions here — the target is a third party — just a
              way out to a real tab beside the close. While waiting (undefined),
              the URL stays the accessible name but hidden (sr-only), so a
              WikiOui title arriving a beat later never visibly replaces it; it
              shows only once the frame settles without a title (null): a
              non-WikiOui target, then muted. A detected title reads as an h1
              (text-lg font-semibold). */}
          <DialogTitleBar
            titleClassName={
              typeof title === "string"
                ? "text-lg font-semibold"
                : title === null
                  ? "text-sm font-normal text-muted-foreground"
                  : "sr-only"
            }
            actions={
              <DialogIconLink
                href={href}
                label="Ouvrir dans un nouvel onglet"
                icon={<ExternalLink className="size-4" />}
                newTab
              />
            }
          >
            {title || href}
          </DialogTitleBar>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <WikiFrame target={href} onTitle={setTitle} sized />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
