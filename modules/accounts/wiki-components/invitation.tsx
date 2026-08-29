"use client";

// Where every single-use link lands (docs/permissions.md § Naissance d'un
// compte). One system page for the three needs it serves: what it offers is
// decided by the token, and the token travels in the query string because this
// system page is a wiki page — behind a page slug, a segment is a handler (ADR
// 0028). Nobody is signed in here, so the token is the whole credential.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { readInvitation } from "@/modules/accounts/invitation/auth-actions";
import { AcceptInvitationForm } from "@/modules/accounts/ui/accept-invitation-form";
import { ResetPasswordForm } from "@/modules/accounts/ui/reset-password-form";
import { Button } from "@/components/ui/button";
import type { AccountLinkTarget } from "@/modules/accounts/invitation/link";
import { INVITATION_TOKEN_PARAM } from "@/modules/accounts/invitation/rules";
import { authPagePath } from "@/wiki.config";

// Built-in component rendered by the `invitation` special page (ADR 0028):
// where an invitation, a « mot de passe oublié » and an administrator's reset
// all land. This system page reads its token from the query string, hence the
// Suspense boundary.
export function Invitation() {
  return (
    <div className="not-prose mx-auto w-full max-w-sm py-6">
      <Suspense>
        <InvitationView />
      </Suspense>
    </div>
  );
}

function InvitationView() {
  const token = useSearchParams().get(INVITATION_TOKEN_PARAM) ?? "";
  // undefined while the link is being read, null once it proved worthless.
  const [target, setTarget] = useState<AccountLinkTarget | null | undefined>();

  useEffect(() => {
    let current = true;
    void readInvitation(token).then((resolved) => {
      if (current) setTarget(resolved);
    });
    return () => {
      current = false;
    };
  }, [token]);

  if (target === undefined) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Vérification du lien…
      </p>
    );
  }
  if (target === null) return <SpentLink />;

  return target.purpose === "invitation" ? (
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
  );
}

/**
 * Expired, already used, or never issued — the system page does not tell those
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
        <Link href={authPagePath("signIn")}>Aller à la connexion</Link>
      </Button>
    </div>
  );
}
