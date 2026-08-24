import { Suspense } from "react";
import { AdminOnly } from "@/modules/permissions/admin-only";
import { GroupsAdmin as GroupsAdminView } from "../ui/groups-admin";

// Built-in component rendered by the `gerer-utilisateurs` special page
// (docs/permissions.md § Les pages système), below <UsersAdmin />. Creating and
// editing a group is an administrator's action in v0.5, so the whole system page
// is behind the same gate as the users list.
export function GroupsAdmin() {
  return (
    <div className="not-prose mt-8">
      <AdminOnly>
        <Suspense>
          <GroupsAdminView />
        </Suspense>
      </AdminOnly>
    </div>
  );
}
