import { Suspense } from "react";
import { AdminOnly } from "@/modules/permissions/admin-only";
import { UsersAdmin as UsersAdminView } from "../ui/users-admin";

// Built-in component rendered by the `gerer-utilisateurs` special page
// (docs/permissions.md § Les pages système). This system page reads the URL via
// useSearchParams, so it needs a Suspense boundary at the render seam.
// `not-prose`: an app system page inside an MDX page owns its spacing, the host
// page's typographic margins must not reach it.
export function UsersAdmin() {
  return (
    <div className="not-prose">
      <AdminOnly>
        <Suspense>
          <UsersAdminView />
        </Suspense>
      </AdminOnly>
    </div>
  );
}
