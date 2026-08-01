import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// The « ⓘ » remark the screens put under a widget to say what cannot be
// changed. It used to be the character, which every font places on its own
// baseline — visibly below the sentence it introduces.
//
// An icon beside text is not centred on the line box: the eye reads the
// baseline, where every letter stops, so anything hanging below it looks like
// it has slipped. The disc is therefore sized to the height of a capital
// (Inter's cap height is 0.73em, and the note is the only place this is worth
// measuring) and set on the baseline itself — so it occupies exactly the band
// the « L » of the sentence does. Both values follow the font size rather than
// being nudges to keep in tune with it.
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
        "flex items-baseline gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Info className="size-[0.73em] shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
