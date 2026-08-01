"use client";

// FormsAdmin (docs/forms.md, ADR 0014): the form-administration screen behind
// the `formulaires` special page. A client component that reads its state
// from the URL (?nouveau, ?id=slug) and loads data through Server Actions.

import { FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type FormDetail,
  type FormSummary,
  deleteForm,
  getForm,
  listForms,
  listFormChoices,
  listRightsDirectory,
} from "@/app/form-actions";
import type { AclDirectory } from "@/lib/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDirectKeyboard } from "@/components/ui/use-direct-keyboard";
import { formatDateTime } from "@/lib/format";
import { FormBuilder } from "./form-builder";

export function FormsAdmin() {
  const params = useSearchParams();
  const router = useRouter();

  if (params.has("nouveau")) {
    return <BuilderScreen editSlug={null} />;
  }
  const editSlug = params.get("id");
  if (editSlug !== null) {
    return <BuilderScreen editSlug={editSlug} />;
  }
  return <FormsList onOpen={(url) => router.push(url)} />;
}

function FormsList({ onOpen }: { onOpen: (url: string) => void }) {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [toDelete, setToDelete] = useState<FormSummary | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    listForms().then(setForms);
  }, []);

  useDirectKeyboard(filterRef);

  const visible = (forms ?? []).filter((form) =>
    form.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  function confirmDelete() {
    if (!toDelete) return;
    const slug = toDelete.slug;
    setToDelete(null);
    startTransition(async () => {
      const result = await deleteForm(slug);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Formulaire supprimé.");
        setForms((current) => current?.filter((form) => form.slug !== slug) ?? null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">Formulaires</h1>
        <Button asChild>
          <Link href="?nouveau">
            <Plus />
            Nouveau formulaire
          </Link>
        </Button>
      </div>

      <Input
        ref={filterRef}
        value={filter}
        placeholder="Filtrer par nom…"
        onChange={(event) => setFilter(event.target.value)}
      />

      {forms === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {forms.length === 0
            ? "Aucun formulaire pour l'instant."
            : "Aucun formulaire ne correspond au filtre."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((form) => (
            <li
              key={form.slug}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{form.name}</p>
                <p className="text-xs text-muted-foreground">
                  <code className="font-mono">{form.slug}</code> ·{" "}
                  {form.entryCount} fiche{form.entryCount > 1 ? "s" : ""} · créé
                  le {formatDateTime(form.createdAt)}
                </p>
              </div>
              {/* An offer nobody can take up informs nobody: a row shows the
                  gestures this actor has, and leaves the others out
                  (docs/permissions.md § Ce que voit qui n'a pas le droit). */}
              {form.canCreateEntry && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/fiches?nouvelle&formulaire=${form.slug}`}>
                    <FilePlus2 />
                    Nouvelle fiche
                  </Link>
                </Button>
              )}
              {form.canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpen(`?id=${form.slug}`)}
                  >
                    <Pencil />
                    Éditer
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer ${form.name}`}
                    onClick={() => setToDelete(form)}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce formulaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && toDelete.entryCount > 0 ? (
                <>
                  <strong>Attention :</strong> supprimer «&nbsp;{toDelete.name}
                  &nbsp;» emporte aussi ses {toDelete.entryCount} fiche
                  {toDelete.entryCount > 1 ? "s" : ""}. Cette action est
                  irréversible.
                </>
              ) : (
                <>
                  Le formulaire «&nbsp;{toDelete?.name}&nbsp;» sera supprimé.
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BuilderScreen({ editSlug }: { editSlug: string | null }) {
  const router = useRouter();
  const [initial, setInitial] = useState<FormDetail | null>(null);
  const [forms, setForms] = useState<{ slug: string; name: string }[]>([]);
  const [directory, setDirectory] = useState<AclDirectory>({
    people: [],
    groups: [],
  });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      editSlug ? getForm(editSlug) : Promise.resolve(null),
      listFormChoices(),
      listRightsDirectory(editSlug),
    ]).then(([form, choices, people]) => {
      if (!live) return;
      if (editSlug && !form) setNotFound(true);
      setInitial(form);
      setForms(choices);
      setDirectory(people);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [editSlug]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (notFound) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Ce formulaire est introuvable.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/formulaires">Retour à la liste</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/formulaires"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Formulaires
      </Link>
      <FormBuilder
        initial={initial}
        forms={forms}
        directory={directory}
        onSaved={() => router.push("/formulaires")}
        // replace, not push: the old ?id= no longer answers, going "back" to
        // it would only show « introuvable ». BuilderScreen refetches but the
        // builder stays mounted, so unsaved canvas edits survive.
        onRenamed={(slug) => router.replace(`/formulaires?id=${slug}`)}
      />
    </div>
  );
}
