import { cn } from "@/lib/utils";

// The wiki's typographic envelope, applied around rendered MDX only. The
// typography plugin's margins are sized for flowing text: they must never
// reach app UI (entry forms, admin screens, the default entry view), which
// owns its own spacing scale.
export function Prose({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("prose prose-neutral max-w-none dark:prose-invert", className)}>
      {children}
    </div>
  );
}
