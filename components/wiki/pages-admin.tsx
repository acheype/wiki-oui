import { PagesAdmin as PagesAdminScreen } from "@/components/page/pages-admin";
import { AdminOnly } from "@/components/users/admin-only";

// Built-in component rendered by the `gerer-pages` special page
// (docs/permissions.md § Les écrans). It reads nothing from the URL, so no
// Suspense boundary is needed at the render seam.
// `not-prose`: an app screen inside an MDX page owns its spacing, the host
// page's typographic margins must not reach it.
export function PagesAdmin() {
  return (
    <div className="not-prose">
      <AdminOnly>
        <PagesAdminScreen />
      </AdminOnly>
    </div>
  );
}
