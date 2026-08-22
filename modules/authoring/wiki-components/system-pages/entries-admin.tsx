import { Suspense } from "react";
import { EntriesAdmin as EntriesAdminScreen } from "@/modules/forms/entries-admin";

// Built-in component rendered by the `fiches` special page (ADR 0014). The
// system page reads the URL via useSearchParams, hence the Suspense boundary.
// `not-prose`: an app system page inside an MDX page must escape the host page's
// typographic margins, so entry creation here matches /{slug}/edit exactly.
export function EntriesAdmin() {
  return (
    <div className="not-prose">
      <Suspense>
        <EntriesAdminScreen />
      </Suspense>
    </div>
  );
}
