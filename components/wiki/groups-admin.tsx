import { Suspense } from "react";
import { AdminOnly } from "@/components/accounts/admin-only";
import { GroupsAdmin as GroupsAdminScreen } from "@/components/accounts/groups-admin";

// Built-in component rendered by the `gerer-utilisateurs` special page
// (docs/permissions.md § Les écrans), below <UsersAdmin />. Creating and
// editing a group is an administrator's gesture in v0.5, so the whole screen
// is behind the same gate as the accounts list.
export function GroupsAdmin() {
  return (
    <div className="not-prose mt-8">
      <AdminOnly>
        <Suspense>
          <GroupsAdminScreen />
        </Suspense>
      </AdminOnly>
    </div>
  );
}
