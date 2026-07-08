import { diffLines } from "diff";
import { cn } from "@/lib/utils";

// Diffs are computed on the MDX source only (ADR 0009): diffing rendered
// HTML would hide what the author actually changed.
export function DiffView({ from, to }: { from: string; to: string }) {
  const parts = diffLines(from, to);

  if (!parts.some((part) => part.added || part.removed)) {
    return (
      <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Aucune différence.
      </p>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-md border font-mono text-xs leading-relaxed">
      <code>
        {parts.map((part, partIndex) => {
          const lines = part.value.replace(/\n$/, "").split("\n");
          const prefix = part.added ? "+" : part.removed ? "-" : " ";
          return lines.map((line, lineIndex) => (
            <div
              key={`${partIndex}-${lineIndex}`}
              className={cn(
                "px-3",
                part.added &&
                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                part.removed && "bg-red-500/10 text-red-700 dark:text-red-400",
                !part.added && !part.removed && "text-muted-foreground"
              )}
            >
              {prefix} {line}
            </div>
          ));
        })}
      </code>
    </pre>
  );
}
