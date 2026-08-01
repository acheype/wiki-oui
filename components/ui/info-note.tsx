import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// The « ⓘ » remark the screens put under a widget to say what cannot be
// changed. The glyph was written as a character, which every font places on
// its own baseline — noticeably below the sentence it belongs to. An icon of
// the set already used everywhere else sits where it is put.
export function InfoNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Info className="mt-[0.15em] size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
