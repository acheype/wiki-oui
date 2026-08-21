import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { currentIdentity, isCurrentAdmin } from "@/modules/permissions/person";
import { authPagePath } from "@/wiki.config";

// A block of content nobody else may see is shown with its reason and a way
// on (docs/permissions.md § Ce que voit qui n'a pas le droit) — unlike an
// action, which is simply hidden: an offer that cannot be taken informs
// nobody, but a screen that vanished leaves the page looking broken.
export async function AdminOnly({ children }: { children: React.ReactNode }) {
  if (await isCurrentAdmin()) return <>{children}</>;

  const identity = await currentIdentity();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
      <Lock className="size-4" aria-hidden />
      <span className="flex-1">Réservé aux administrateurs.</span>
      {!identity && (
        <Button asChild variant="outline" size="sm">
          <Link href={authPagePath("signIn")}>Se connecter</Link>
        </Button>
      )}
    </div>
  );
}
