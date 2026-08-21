import { Suspense } from "react";
import { InvitationScreen } from "@/modules/accounts/invitation-screen";

// Built-in component rendered by the `invitation` special page (ADR 0028):
// where an invitation, a « mot de passe oublié » and an administrator's reset
// all land. The screen reads its token from the query string, hence the
// Suspense boundary.
export function Invitation() {
  return (
    <div className="not-prose mx-auto w-full max-w-sm py-6">
      <Suspense>
        <InvitationScreen />
      </Suspense>
    </div>
  );
}
