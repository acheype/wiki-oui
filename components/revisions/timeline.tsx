"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime, formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimelineRevision = {
  id: string;
  createdAt: Date;
  authorName: string | null;
  isCurrent: boolean;
  isRestore: boolean;
};

// Horizontal timeline, most recent on the RIGHT (ADR 0009).
export function RevisionTimeline({
  revisions,
  selectedId,
}: {
  /** Oldest first; rendered left to right. */
  revisions: TimelineRevision[];
  selectedId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedRef = useRef<HTMLAnchorElement>(null);

  function hrefFor(revisionId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("rev", revisionId);
    return `${pathname}?${next.toString()}`;
  }

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedId]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto pb-1">
        <ol className="relative mx-2 flex min-w-max items-start gap-8 px-4 pt-1">
          {/* Connecting rail behind the dots */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-[13px] h-px bg-border"
          />
          {revisions.map((revision) => {
            const selected = revision.id === selectedId;
            return (
              <li key={revision.id} className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      ref={selected ? selectedRef : undefined}
                      href={hrefFor(revision.id)}
                      replace
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      className="group flex flex-col items-center gap-1.5"
                    >
                      <span
                        className={cn(
                          "size-[13px] rounded-full border-2 bg-background transition-all group-hover:scale-110",
                          selected
                            ? "border-primary bg-primary"
                            : revision.isCurrent
                              ? "border-primary"
                              : "border-muted-foreground/50",
                          revision.isRestore && "rounded-[3px]"
                        )}
                      />
                      <span
                        className={cn(
                          "whitespace-nowrap text-[11px] tabular-nums",
                          selected
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatShortDateTime(revision.createdAt)}
                      </span>
                      {revision.isCurrent && (
                        <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                          courante
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatDateTime(revision.createdAt)} ·{" "}
                    {revision.authorName ?? "Anonyme"}
                    {revision.isRestore && " · restauration"}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ol>
      </div>
    </TooltipProvider>
  );
}
