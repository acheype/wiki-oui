import { Suspense } from "react";
import { FormsAdmin as FormsAdminScreen } from "@/components/forms/forms-admin";

// Built-in component rendered by the `formulaires` special page (ADR 0014).
// The screen reads the URL via useSearchParams, so it needs a Suspense
// boundary at the render seam.
export function FormsAdmin() {
  return (
    <Suspense>
      <FormsAdminScreen />
    </Suspense>
  );
}
