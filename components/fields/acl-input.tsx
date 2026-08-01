"use client";

// The scope-and-list widget (docs/permissions.md § Le droit), a field type of
// the shared renderer rather than a one-off dialog: the same thing poses the
// rights of a page, of a form and — once ADR 0015's settings panel reads it —
// of a single field. Written once, it reads the same everywhere.

import { Lock, Plus, UserRound, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type AccessRule,
  type AclDirectory,
  type AclFloor,
  type Scope,
  SCOPES,
  SCOPE_LABELS,
  aclFloorLabels,
  aclFloorPrincipals,
  alwaysAllowedNote,
} from "@/lib/permissions";

const EMPTY_DIRECTORY: AclDirectory = { people: [], groups: [] };
/** The floor of a subject with no owner to name — the wiki's own defaults. */
export const NO_FLOOR: AclFloor = { owner: null };

export function AclInput({
  id,
  value,
  directory = EMPTY_DIRECTORY,
  floor,
  onChange,
}: {
  id: string;
  value: AccessRule;
  directory?: AclDirectory;
  floor: AclFloor;
  onChange: (rule: AccessRule) => void;
}) {
  const locked = aclFloorLabels(floor);
  const covered = aclFloorPrincipals(floor);
  const usernames = value.usernames ?? [];
  const groupSlugs = value.groupSlugs ?? [];

  const nameOfPerson = new Map(
    directory.people.map((person) => [person.username, person.name]),
  );
  const nameOfGroup = new Map(
    directory.groups.map((group) => [group.slug, group.name]),
  );

  function set(next: Partial<AccessRule>) {
    onChange({ scope: value.scope, usernames, groupSlugs, ...next });
  }

  return (
    <div className="grid gap-2">
      <RadioGroup
        value={value.scope}
        // The list keeps what it holds while another scope is selected: a
        // change of mind costs nothing, and « seulement » comes back with the
        // people already named. Only what is saved is read (aclEntries drops
        // the list for the other two scopes).
        onValueChange={(scope) => set({ scope: scope as Scope })}
        className="gap-1.5"
      >
        {SCOPES.map((scope) => (
          <Label
            key={scope}
            htmlFor={`${id}-${scope}`}
            className="flex items-center gap-2 font-normal"
          >
            <RadioGroupItem id={`${id}-${scope}`} value={scope} />
            {SCOPE_LABELS[scope]}
            {scope === "restricted" && " :"}
          </Label>
        ))}
      </RadioGroup>

      {value.scope === "restricted" && (
        <div className="ml-6 flex flex-wrap items-center gap-2 rounded-md border p-2">
          {/* Shown because an empty box reads as « personne », where what was
              chosen is « eux seuls ». */}
          {locked.people.map((label) => (
            <LockedChip
              key={label}
              icon={<UserRound className="size-3.5" />}
              label={label}
            />
          ))}
          {locked.groups.map((label) => (
            <LockedChip
              key={label}
              icon={<UsersRound className="size-3.5" />}
              label={label}
            />
          ))}
          {usernames
            .filter((username) => !covered.usernames.includes(username))
            .map((username) => (
              <AclChip
                key={username}
                icon={<UserRound className="size-3.5" />}
                label={nameOfPerson.get(username) ?? username}
                onRemove={() =>
                  set({
                    usernames: usernames.filter((one) => one !== username),
                  })
                }
              />
            ))}
          {groupSlugs
            .filter((slug) => !covered.groupSlugs.includes(slug))
            .map((slug) => (
              <AclChip
                key={slug}
                icon={<UsersRound className="size-3.5" />}
                label={`@${nameOfGroup.get(slug) ?? slug}`}
                onRemove={() =>
                  set({ groupSlugs: groupSlugs.filter((one) => one !== slug) })
                }
              />
            ))}
          <AddToListPopover
            directory={directory}
            // The floor joins what is already listed: adding either would
            // write a row that grants nothing.
            listed={{
              usernames: [...usernames, ...covered.usernames],
              groupSlugs: [...groupSlugs, ...covered.groupSlugs],
            }}
            onAddPerson={(username) =>
              set({ usernames: [...usernames, username] })
            }
            onAddGroup={(slug) => set({ groupSlugs: [...groupSlugs, slug] })}
          />
        </div>
      )}

      <InfoNote>{alwaysAllowedNote(floor)}</InfoNote>
    </div>
  );
}

function LockedChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-dashed bg-muted/50 py-1 pl-2.5 pr-2.5 text-sm text-muted-foreground">
      <span>{icon}</span>
      {label}
      <Lock className="size-3" aria-label="Accès permanent" />
    </span>
  );
}

function AclChip({
  icon,
  label,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      {label}
      <button
        type="button"
        aria-label={`Retirer ${label}`}
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function AddToListPopover({
  directory,
  listed,
  onAddPerson,
  onAddGroup,
}: {
  directory: AclDirectory;
  listed: { usernames: readonly string[]; groupSlugs: readonly string[] };
  onAddPerson: (username: string) => void;
  onAddGroup: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matching = (label: string) =>
    label.toLowerCase().includes(query.trim().toLowerCase());
  const people = directory.people.filter(
    (person) =>
      !listed.usernames.includes(person.username) && matching(person.name),
  );
  const groups = directory.groups.filter(
    (group) => !listed.groupSlugs.includes(group.slug) && matching(group.name),
  );

  function pick(add: () => void) {
    setOpen(false);
    setQuery("");
    add();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Plus />
          Ajouter…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-72 gap-2 p-3" align="start">
        <Input
          value={query}
          autoFocus
          placeholder="Rechercher une personne, un groupe…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid max-h-64 gap-0.5 overflow-y-auto">
          {people.map((person) => (
            <PickerRow
              key={person.username}
              icon={<UserRound className="size-3.5" />}
              label={person.name}
              hint={person.username}
              onSelect={() => pick(() => onAddPerson(person.username))}
            />
          ))}
          {groups.map((group) => (
            <PickerRow
              key={group.slug}
              icon={<UsersRound className="size-3.5" />}
              label={`@${group.name}`}
              onSelect={() => pick(() => onAddGroup(group.slug))}
            />
          ))}
          {people.length === 0 && groups.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Rien à ajouter.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickerRow({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <code className="font-mono text-xs text-muted-foreground">{hint}</code>
      )}
    </button>
  );
}
