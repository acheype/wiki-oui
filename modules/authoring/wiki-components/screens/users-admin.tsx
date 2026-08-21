import { Suspense } from "react";
import { AdminOnly } from "@/modules/permissions/admin-only";
import { UsersAdmin as UsersAdminScreen } from "@/modules/accounts/users-admin";

// Built-in component rendered by the `gerer-utilisateurs` special page
// (docs/permissions.md § Les écrans). The screen reads the URL via
// useSearchParams, so it needs a Suspense boundary at the render seam.
// `not-prose`: an app screen inside an MDX page owns its spacing, the host
// page's typographic margins must not reach it.
export function UsersAdmin() {
  return (
    <div className="not-prose">
      <AdminOnly>
        <Suspense>
          <UsersAdminScreen />
        </Suspense>
      </AdminOnly>
    </div>
  );
}
