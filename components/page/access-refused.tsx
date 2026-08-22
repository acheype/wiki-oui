import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DESTINATION_PARAM } from "@/lib/destination";
import { ACCESS_DENIED, ownerLine } from "@/lib/permissions";
import { currentIdentity } from "@/lib/permissions-db";
import { cn } from "@/lib/utils";
import { authPagePath } from "@/wiki.config";

// One message for every refusal (docs/permissions.md § Ce que voit qui n'a
// pas le droit), without trying to hide that the page exists: a 404 would be
// a second, contradictory story the moment someone arrived from a link that
// named it — and it would leave whoever should ask for access with nobody to
// ask.
export async function AccessRefused({
  slug,
  ownerName,
  message = ACCESS_DENIED,
  compact = false,
}: {
  slug: string;
  ownerName: string | null;
  /** The refusal of a write, on the rare screen reached without the right. */
  message?: string;
  /**
   * A smaller box for a small frame: `/{slug}/iframe`'s own render, which is
   * always embedded (docs/permissions.md § Liens et boutons vers
   * l'inaccessible) — `<Iframe>`'s `WikiFrame` auto-sizes down to it (ADR 0022).
   */
  compact?: boolean;
}) {
  const identity = await currentIdentity();
  const owner = ownerLine(ownerName);

  return (
    <div
      className={cn(
        "mx-auto flex flex-col items-center rounded-xl border border-dashed text-center",
        compact ? "max-w-xs gap-2 px-4 py-6" : "max-w-md gap-4 px-6 py-16"
      )}
    >
      <Lock
        className={cn("text-muted-foreground", compact ? "size-5" : "size-8")}
        aria-hidden
      />
      <div>
        <h1 className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>
          {message}
        </h1>
        {owner && (
          <p
            className={cn(
              "mt-1 text-muted-foreground",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {owner}
          </p>
        )}
      </div>
      {/* Offered only to a visitor: someone already signed in has nothing to
          gain from signing in again, and the button would read as a promise. */}
      {!identity && (
        <Button asChild size={compact ? "sm" : "default"}>
          <Link
            href={`${authPagePath("signIn")}?${DESTINATION_PARAM}=${encodeURIComponent(`/${slug}`)}`}
          >
            Se connecter
          </Link>
        </Button>
      )}
    </div>
  );
}
