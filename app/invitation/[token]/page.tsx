import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { readAccountLink } from "@/lib/accounts-db";

// Where every single-use link lands (docs/permissions.md § Naissance d'un
// compte). One route for the three needs it serves: what the screen offers is
// decided here, by whether the address already holds an account — an
// invitation asks for a name, an identifier and a password, a reset only for
// a password. A route rather than a wiki page: nobody is signed in yet.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Invitation — WikiOui" };

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const target = await readAccountLink(token);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      {target === null ? (
        <SpentLink />
      ) : target.purpose === "invitation" ? (
        <AcceptInvitationForm
          token={token}
          email={target.email}
          groupName={target.group?.name}
        />
      ) : (
        <ResetPasswordForm
          token={token}
          email={target.email}
          name={target.name ?? target.email}
        />
      )}
    </main>
  );
}

/**
 * Expired, already used, or never issued — the screen does not tell those
 * apart. It would only teach whoever is holding a link they should not have,
 * and the way forward is the same in all three cases: ask for another.
 */
function SpentLink() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Ce lien n&apos;est plus valable
      </h1>
      <p className="text-sm text-muted-foreground">
        Un lien ne fonctionne qu&apos;une seule fois, et pas indéfiniment.
        Demandez-en un nouveau à un administrateur du wiki.
      </p>
      <Button asChild variant="outline">
        <Link href="/connexion">Aller à la connexion</Link>
      </Button>
    </div>
  );
}
