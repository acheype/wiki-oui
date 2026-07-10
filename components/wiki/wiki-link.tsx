"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isWikiHref } from "@/lib/slug";

type WikiLinkProps = React.ComponentPropsWithoutRef<"a">;

// Renders every `a` coming out of the MDX pipeline (ADR 0006).
// target comes from the author via an annotation: "_blank" or "modal".
export function WikiLink({ href = "", target, children, ...rest }: WikiLinkProps) {
  const isExternal = /^https?:\/\//.test(href);
  const isInternal = isWikiHref(href);
  // Author links are slug-relative; resolve from the site root so they work
  // from handler URLs like /ma-page/edit too.
  const resolvedHref = isInternal ? `/${href}` : href;

  if (target === "modal") {
    return (
      <ModalLink href={resolvedHref} {...rest}>
        {children}
      </ModalLink>
    );
  }

  if (target === "_blank") {
    return (
      <a href={resolvedHref} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }

  if (isInternal && !isExternal) {
    return (
      <Link href={resolvedHref} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

function ModalLink({
  href,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"a"> & { href: string }) {
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
