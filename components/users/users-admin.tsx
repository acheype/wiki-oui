"use client";

// UsersAdmin (docs/permissions.md § Les écrans): the accounts half of the
// `gerer-utilisateurs` special page. It takes the direct keyboard — typing
// anywhere fills the filter — which is why the groups list below keeps an
// ordinary search field: two lists cannot share the keyboard.
//
// A person's line carries their groups both ways round: the ones they were
// added to as chips, the ones nesting put them in greyed out with the way in.
// That is usually where one looks for *why* someone has access.

import { UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listUsers } from "@/app/user-actions";
import { Input } from "@/components/ui/input";
import { PATH_SEPARATOR } from "@/lib/groups";
import type { NamedGroup, UserRow } from "@/lib/groups-db";

export function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listUsers().then(setUsers);
  }, []);

  // Direct-keyboard filter (docs/forms.md): typing anywhere fills the filter
  // without clicking it first.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        return;
      }
      filterRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const needle = filter.trim().toLowerCase();
  const visible = (users ?? []).filter((user) =>
    [user.name, user.username, user.email].some((field) =>
      field.toLowerCase().includes(needle)
    )
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Utilisateurs</h2>

      <Input
        ref={filterRef}
        value={filter}
        placeholder="Tapez pour filtrer…"
        onChange={(event) => setFilter(event.target.value)}
      />

      {users === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {users.length === 0
            ? "Aucun compte pour l'instant."
            : "Aucun compte ne correspond au filtre."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((user) => (
            <li
              key={user.username}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <UserRound className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <code className="font-mono">{user.username}</code> ·{" "}
                    {user.email}
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {user.groups.map((group) => (
                  <GroupChip key={group.slug} group={group} />
                ))}
                {user.inherited.map(({ group, path }) => (
                  <GroupChip key={group.slug} group={group} path={path} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A group of a person's line: direct as a chip, inherited greyed out. */
function GroupChip({ group, path }: { group: NamedGroup; path?: NamedGroup[] }) {
  const pathname = usePathname();
  const way = path
    ?.map((step) => `@${step.name}`)
    .join(PATH_SEPARATOR);
  return (
    <Link
      href={`${pathname}?groupe=${group.slug}`}
      title={way && `Membre via ${way}`}
      className={
        way
          ? "rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          : "rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
      }
    >
      @{group.name}
      {way && <span className="ml-1">· via {way}</span>}
    </Link>
  );
}
