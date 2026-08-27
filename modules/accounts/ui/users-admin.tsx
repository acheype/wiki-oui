"use client";

// UsersAdmin (docs/permissions.md § Les pages système): the accounts half of the
// `gerer-utilisateurs` special page. It takes the direct keyboard — typing
// anywhere fills the filter — which is why the groups list below keeps an
// ordinary search field: two lists cannot share the keyboard.
//
// A person's line carries their groups both ways round: the ones they were
// added to as chips, the ones nesting put them in greyed out with the way in.
// That is usually where one looks for *why* someone has access.
//
// Pending invitations share the list rather than sitting in one of their own:
// an address invited and a person arrived are the same population seen a
// fortnight apart, and the filters are what tell them apart.

import { Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listInvitations,
  listUsers,
  signedInUsername,
} from "@/modules/accounts/actions";
import { AccountActions, InvitationActions } from "@/modules/accounts/ui/account-actions";
import { InviteDialog } from "@/modules/accounts/ui/invite-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDirectKeyboard } from "@/components/ui/use-direct-keyboard";
import {
  ACCOUNT_FILTERS,
  type AccountFilter,
  matchesAccountFilter,
} from "@/modules/accounts/rules";
import type { PendingInvitation, UserRow } from "@/modules/accounts/access/guards";
import { formatDayMonth } from "@/lib/format";
import { PATH_SEPARATOR } from "@/modules/permissions/groups-nesting";
import type { NamedGroup } from "@/modules/permissions/groups-directory";

export function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [needle, setNeedle] = useState("");
  /** Whose session this is: their own line offers other permissions. */
  const [me, setMe] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    listUsers().then(setUsers);
    listInvitations().then(setInvitations);
  }, []);

  useEffect(() => reload(), [reload]);

  useEffect(() => {
    signedInUsername().then(setMe);
  }, []);

  useDirectKeyboard(filterRef);

  const searched = needle.trim().toLowerCase();
  const matches = (...fields: string[]) =>
    fields.some((field) => field.toLowerCase().includes(searched));

  const visibleUsers = (users ?? []).filter(
    (user) =>
      matches(user.name, user.username, user.email) &&
      matchesAccountFilter(user.disabled ? "disabled" : "active", filter)
  );
  const visibleInvitations = invitations.filter(
    (invitation) =>
      matches(invitation.email) && matchesAccountFilter("invited", filter)
  );
  const empty = visibleUsers.length === 0 && visibleInvitations.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Utilisateurs</h2>
        <InviteDialog onInvited={reload} />
      </div>

      <Input
        ref={filterRef}
        value={needle}
        placeholder="Tapez pour filtrer…"
        onChange={(event) => setNeedle(event.target.value)}
      />

      <RadioGroup
        value={filter}
        onValueChange={(value) => setFilter(value as AccountFilter)}
        className="flex flex-wrap gap-x-5 gap-y-2"
      >
        {ACCOUNT_FILTERS.map((choice) => (
          <div key={choice.value} className="flex items-center gap-2">
            <RadioGroupItem value={choice.value} id={`accounts-${choice.value}`} />
            <Label
              htmlFor={`accounts-${choice.value}`}
              className="text-sm font-normal"
            >
              {choice.label}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {users === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : empty ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {users.length === 0 && invitations.length === 0
            ? "Aucun compte pour l'instant."
            : "Aucun compte ne correspond au filtre."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {visibleUsers.map((user) => (
            <li
              key={user.username}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <UserRound className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        user.disabled
                          ? "truncate font-medium text-muted-foreground line-through"
                          : "truncate font-medium"
                      }
                    >
                      {user.name}
                    </span>
                    {user.disabled && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Désactivé
                      </span>
                    )}
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
              <AccountActions
                user={user}
                users={users}
                own={user.username === me}
                onChanged={reload}
              />
            </li>
          ))}

          {visibleInvitations.map((invitation) => (
            <li
              key={invitation.email}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Mail className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate">{invitation.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {invitation.expired ? "invitation expirée, envoyée le" : "invité le"}{" "}
                    {formatDayMonth(invitation.invitedAt)}
                    {invitation.group && ` · rejoindra @${invitation.group.name}`}
                  </span>
                </span>
              </span>
              <InvitationActions invitation={invitation} onChanged={reload} />
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
