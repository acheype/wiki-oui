import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// The « ⓘ » remark the screens put under a widget to say what cannot be
// changed. It used to be the character, which every font places on its own
// baseline — visibly below the sentence it introduces.
//
// Where the disc sits is a matter of how it overhangs the capitals, not of
// centring: the eye reads the top of the letters and the baseline they stop
// on, and a disc bigger than a capital has to spill past both by the same
// amount or it looks like it has slipped. So it is set on the baseline and
// pushed back down by half of what it exceeds a capital by — 0.75em at this
// size, Inter's cap height. The two terms follow the icon and the font, so
// changing either keeps the balance rather than needing a new nudge.
//
// No other icon in the interface needs this: they sit beside a single line,
// where centring is right because there is no second line to hang from.
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
      <Info
        className="size-3.5 shrink-0 translate-y-[calc((100%-0.75em)/2)]"
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}
