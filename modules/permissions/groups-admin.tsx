"use client";

// GroupsAdmin (docs/permissions.md § Les écrans): the groups half of the
// `gerer-utilisateurs` special page. State lives in the URL — `?groupe=slug`
// opens an editor — so the ways in named all over the wiki are real links.
// The ordinary search field is deliberate: two lists cannot share the
// keyboard, and direct typing belongs to the accounts list above.

import { Plus, Shield, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createGroup, listGroups } from "@/modules/permissions/group-actions";
import { GroupEditor } from "@/modules/permissions/ui/group-editor";
import { SlugInlineEdit } from "@/modules/pages/slug-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GroupSummary } from "@/modules/permissions/groups-queries";
import { slugify } from "@/lib/slug";

export function GroupsAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editing = params.get("groupe");

  if (editing !== null) {
    return (
      <GroupEditor slug={editing} onDeleted={() => router.push(pathname)} />
    );
  }
  return <GroupsList />;
}

function GroupsList() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    listGroups().then(setGroups);
  }, []);

  const needle = filter.trim().toLowerCase();
  const visible = (groups ?? []).filter((group) =>
    // The slug too: it is what the rights store and what the URL carries, so
    // it is what one has at hand when arriving from either.
    [group.name, group.slug].some((field) =>
      field.toLowerCase().includes(needle)
    )
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Groupes</h2>
        <NewGroupDialog
          onCreated={(slug) => router.push(`${pathname}?groupe=${slug}`)}
        />
      </div>

      <Input
        value={filter}
        placeholder="Rechercher un groupe…"
        onChange={(event) => setFilter(event.target.value)}
      />

      {groups === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {groups.length === 0
            ? "Aucun groupe pour l'instant."
            : "Aucun groupe ne correspond à la recherche."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {visible.map((group) => (
            <li key={group.slug}>
              <Link
                href={`${pathname}?groupe=${group.slug}`}
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <UsersRound className="size-3.5 text-muted-foreground" />
                <span className="font-medium">@{group.name}</span>
                {group.protected && (
                  <Shield
                    className="size-3.5 text-muted-foreground"
                    aria-label="Groupe protégé"
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  {group.peopleCount} personne
                  {group.peopleCount > 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A new group takes a name and, derived from it, the identifier the rights
 * will store (ADR 0024) — personalisable here, frozen afterwards, like every
 * identity of the project.
 */
function NewGroupDialog({ onCreated }: { onCreated: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [isPending, startTransition] = useTransition();

  function changeName(value: string) {
    setName(value);
    if (!customSlug) setSlug(slugify(value));
  }

  function submit() {
    startTransition(async () => {
      const result = await createGroup({ name, slug });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      onCreated(result.slug);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          setSlug("");
          setCustomSlug(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nouveau groupe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau groupe</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-name">Nom</Label>
            <Input
              id="new-group-name"
              value={name}
              autoFocus
              placeholder="Bureau"
              onChange={(event) => changeName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-slug">Identifiant</Label>
            <SlugInlineEdit
              id="new-group-slug"
              value={slug}
              className="h-8 w-64"
              editLabel="Personnaliser l'identifiant"
              onValueChange={(value) => {
                setCustomSlug(true);
                setSlug(value);
              }}
              onBlur={() => {
                if (slug === "") {
                  setCustomSlug(false);
                  setSlug(slugify(name));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Généré à partir du nom ou personnalisable, puis figé : c&apos;est
              lui que les droits retiennent.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button disabled={isPending || name.trim() === ""} onClick={submit}>
            Créer le groupe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
