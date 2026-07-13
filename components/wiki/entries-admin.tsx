import { Suspense } from "react";
import { EntriesAdmin as EntriesAdminScreen } from "@/components/forms/entries-admin";

// Built-in component rendered by the `fiches` special page (ADR 0014). The
// screen reads the URL via useSearchParams, hence the Suspense boundary.
export function EntriesAdmin() {
  return (
    <Suspense>
      <EntriesAdminScreen />
    </Suspense>
  );
}
