import { Suspense } from "react";
import { FormsAdmin as FormsAdminScreen } from "@/modules/forms/forms-admin";

// Built-in component rendered by the `formulaires` special page (ADR 0014).
// This system page reads the URL via useSearchParams, so it needs a Suspense
// boundary at the render seam.
// `not-prose`: an app system page inside an MDX page owns its spacing, the host
// page's typographic margins must not reach it.
export function FormsAdmin() {
  return (
    <div className="not-prose">
      <Suspense>
        <FormsAdminScreen />
      </Suspense>
    </div>
  );
}
