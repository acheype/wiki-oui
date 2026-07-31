import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DESTINATION_PARAM } from "@/lib/destination";
import { ACCESS_DENIED, managedByLine } from "@/lib/permissions";
import { currentIdentity } from "@/lib/permissions-db";
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
}: {
  slug: string;
  ownerName: string | null;
  /** The refusal of a write, on the rare screen reached without the right. */
  message?: string;
}) {
  const identity = await currentIdentity();
  const managedBy = managedByLine(ownerName);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <Lock className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">{message}</h1>
        {managedBy && (
          <p className="mt-1 text-sm text-muted-foreground">{managedBy}</p>
        )}
      </div>
      {/* Offered only to a visitor: someone already signed in has nothing to
          gain from signing in again, and the button would read as a promise. */}
      {!identity && (
        <Button asChild>
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
