import { PagesAdmin as PagesAdminView } from "../ui/pages-admin";
import { AdminOnly } from "@/modules/permissions/admin-only";

// Built-in component rendered by the `gerer-pages` special page
// (docs/permissions.md § Les pages système). It reads nothing from the URL, so no
// Suspense boundary is needed at the render seam.
// `not-prose`: an app system page inside an MDX page owns its spacing, the host
// page's typographic margins must not reach it.
export function PagesAdmin() {
  return (
    <div className="not-prose">
      <AdminOnly>
        <PagesAdminView />
      </AdminOnly>
    </div>
  );
}
