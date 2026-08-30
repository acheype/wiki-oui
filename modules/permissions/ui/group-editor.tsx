"use client";

// The editor of one group (docs/permissions.md § Les pages système). What can be
// changed and what can only be observed do not mix: direct members are chips
// with a ×, the people held through nesting are read-only lines carrying the
// way they come in by — and that way is clickable, since it is where one goes
// to actually remove them.

import { Pencil, Plus, Shield, Trash2, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type GroupDetailWithRights,
  addMember,
  deleteGroup,
  getGroup,
  removeMember,
  renameGroup,
} from "@/modules/permissions/group-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type MemberRef,
  PATH_SEPARATOR,
  PEOPLE_ONLY_NOTE,
  groupDeletionImpact,
  stillMemberMessage,
} from "@/modules/permissions/groups-nesting";
import type { NamedGroup } from "@/modules/permissions/groups-directory";
import type { Identity } from "@/modules/permissions/rules";

export function GroupEditor({
  slug,
  onDeleted,
}: {
  slug: string;
  /** Back to the list: the group being edited no longer exists. */
  onDeleted: () => void;
}) {
  const [group, setGroup] = useState<GroupDetailWithRights | null>(null);
  const [missing, setMissing] = useState(false);
  const [, startTransition] = useTransition();
  const pathname = usePathname();

  useEffect(() => {
    getGroup(slug).then((detail) =>
      detail ? setGroup(detail) : setMissing(true)
    );
  }, [slug]);

  async function reload(): Promise<GroupDetailWithRights | null> {
    const detail = await getGroup(slug);
    if (detail) setGroup(detail);
    else setMissing(true);
    return detail;
  }

  if (missing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Ce groupe est introuvable.</p>
        <Button asChild variant="outline" className="w-fit">
          <Link href={pathname}>Retour aux groupes</Link>
        </Button>
      </div>
    );
  }
  if (!group) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  function change(
    run: () => Promise<{ error: string } | void>,
    onDone?: (group: GroupDetailWithRights) => void
  ) {
    startTransition(async () => {
      const result = await run();
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      const detail = await reload();
      if (detail) onDone?.(detail);
    });
  }

  function removePerson(person: Identity) {
    change(
      () => removeMember(group!.slug, { username: person.username }),
      (detail) => {
        // The chip is gone and the person stayed: the nesting still holds
        // them, and saying so is the whole point of the two lists.
        const inherited = detail.inherited.find(
          (member) => member.username === person.username
        );
        if (inherited) {
          toast.info(
            stillMemberMessage(
              person.name,
              inherited.path.map((step) => step.name)
            )
          );
        }
      }
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={pathname}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Groupes
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">
          @{group.name}
          {group.protected && (
            <Shield
              className="ml-1.5 inline size-4 text-muted-foreground"
              aria-label="Groupe protégé"
            />
          )}
        </h2>
        {!group.protected && (
          <>
            <RenameGroupDialog
              group={group}
              onRename={(name) => change(() => renameGroup(group.slug, name))}
            />
            <DeleteGroupButton
              group={group}
              onDelete={() =>
                startTransition(async () => {
                  const result = await deleteGroup(group.slug);
                  if (result && "error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(`@${group.name} a été supprimé.`);
                  onDeleted();
                })
              }
            />
          </>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Membres</h3>
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          {group.people.map((person) => (
            <MemberChip
              key={person.username}
              icon={<UserRound className="size-3.5" />}
              label={person.name}
              onRemove={() => removePerson(person)}
            />
          ))}
          {group.groups.map((nested) => (
            <MemberChip
              key={nested.slug}
              icon={<UsersRound className="size-3.5" />}
              label={`@${nested.name}`}
              onRemove={() =>
                change(() => removeMember(group.slug, { groupSlug: nested.slug }))
              }
            />
          ))}
          <AddMemberPopover
            group={group}
            onAdd={(member) => change(() => addMember(group.slug, member))}
          />
        </div>
        {group.protected && (
          <InfoNote>{PEOPLE_ONLY_NOTE}</InfoNote>
        )}
      </section>

      {group.inherited.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Contient aussi, par imbrication</h3>
          <ul className="grid gap-1">
            {group.inherited.map((person) => (
              <li
                key={person.username}
                className="flex flex-wrap items-baseline gap-x-2 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-muted-foreground" />
                  {person.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  via <GroupPath path={person.path} />
                </span>
              </li>
            ))}
          </ul>
          <InfoNote>
            Pour les retirer, modifiez le groupe auquel ils appartiennent.
          </InfoNote>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        → {group.peopleCount} personne{group.peopleCount > 1 ? "s" : ""} au
        total
      </p>
    </div>
  );
}

/** The way in, group by group — each step opens the group it names. */
function GroupPath({ path }: { path: NamedGroup[] }) {
  const pathname = usePathname();
  return (
    <>
      {path.map((step, index) => (
        <span key={step.slug}>
          {index > 0 && PATH_SEPARATOR}
          <Link
            href={`${pathname}?groupe=${step.slug}`}
            className="underline-offset-2 hover:underline"
          >
            @{step.name}
          </Link>
        </span>
      ))}
    </>
  );
}

function MemberChip({
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

/**
 * « + Ajouter… » — people, and groups unless the group takes none. @Admins
 * simply is not offered any: the state is made impossible rather than caught
 * afterwards, and the note says why the list is short.
 */
function AddMemberPopover({
  group,
  onAdd,
}: {
  group: GroupDetailWithRights;
  onAdd: (member: MemberRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matching = (label: string) =>
    label.toLowerCase().includes(query.trim().toLowerCase());
  const people = group.addablePeople.filter((person) => matching(person.name));
  const groups = group.addableGroups.filter((nested) => matching(nested.name));

  function add(member: MemberRef) {
    setOpen(false);
    setQuery("");
    onAdd(member);
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
          placeholder="Rechercher une personne…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="grid max-h-64 gap-0.5 overflow-y-auto">
          {people.map((person) => (
            <PickerRow
              key={person.username}
              icon={<UserRound className="size-3.5" />}
              label={person.name}
              hint={person.username}
              onSelect={() => add({ username: person.username })}
            />
          ))}
          {groups.map((nested) => (
            <PickerRow
              key={nested.slug}
              icon={<UsersRound className="size-3.5" />}
              label={`@${nested.name}`}
              onSelect={() => add({ groupSlug: nested.slug })}
            />
          ))}
          {people.length === 0 && groups.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Rien à ajouter.
            </p>
          )}
        </div>
        {group.protected && (
          <InfoNote>{PEOPLE_ONLY_NOTE}</InfoNote>
        )}
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

function RenameGroupDialog({
  group,
  onRename,
}: {
  group: GroupDetailWithRights;
  onRename: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(group.name);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Pencil />
          Renommer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renommer le groupe</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="group-name">Nom</Label>
          <Input
            id="group-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            L&apos;identifiant <code className="font-mono">{group.slug}</code>{" "}
            ne change pas : c&apos;est lui que les droits retiennent.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              onRename(name);
            }}
          >
            Renommer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteGroupButton({
  group,
  onDelete,
}: {
  group: GroupDetailWithRights;
  onDelete: () => void;
}) {
  const impact = groupDeletionImpact(group.name, group.pagesGranting);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 />
          Supprimer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce groupe ?</AlertDialogTitle>
          <AlertDialogDescription>
            @{group.name} sera supprimé, ainsi que les appartenances qui le
            nomment. Les comptes, eux, restent.
            {/* Deleting a group also drops every right that names it, by
                cascade — a consequence that reaches well beyond the group
                system page, so it is counted and said before the click. */}
            {impact && <span className="mt-2 block">{impact}</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
