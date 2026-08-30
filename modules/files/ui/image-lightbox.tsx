"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Client innard of <Image lightbox>: the wiki components themselves stay
// server modules (their defaults must be readable by the descriptor loader),
// interactivity lives in this internal/ folder the registry never scans.
export function ImageLightbox({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn("cursor-zoom-in", className)}
        onClick={() => setOpen(true)}
        aria-label={`Afficher l'image en grand${alt ? ` : ${alt}` : ""}`}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-2 sm:max-w-5xl">
          <DialogTitle className="sr-only">{alt || "Image"}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by our files API, dimensions unknown */}
          <img src={src} alt={alt ?? ""} className="mx-auto max-h-[85vh] w-auto" />
        </DialogContent>
      </Dialog>
    </>
  );
}
