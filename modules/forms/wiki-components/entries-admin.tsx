"use client";

// EntriesAdmin (docs/forms.md, ADR 0014): the `fiches` special page. Lists
// entries (all, or of one form) and hosts entry creation. State lives in the
// URL (?formulaire=slug, ?nouvelle&formulaire=slug); data via Server Actions.

import { FilePlus2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  type EntryFormData,
  type EntrySummary,
  canAddEntry,
  getEntryForm,
  listEntries,
} from "@/modules/forms/entry-actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { EntryForm } from "../entry-form";

// Built-in component rendered by the `fiches` special page (ADR 0014). The
// system page reads the URL via useSearchParams, hence the Suspense boundary.
// `not-prose`: an app system page inside an MDX page must escape the host page's
// typographic margins, so entry creation here matches /{slug}/edit exactly.
export function EntriesAdmin() {
  return (
    <div className="not-prose">
      <Suspense>
        <EntriesAdminView />
      </Suspense>
    </div>
  );
}

function EntriesAdminView() {
  const params = useSearchParams();
  const formSlug = params.get("formulaire") ?? undefined;

  if (params.has("nouvelle") && formSlug) {
    return <NewEntryView formSlug={formSlug} />;
  }
  return <EntriesList formSlug={formSlug} />;
}

function EntriesList({ formSlug }: { formSlug?: string }) {
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  // The form decides who may add to it (docs/permissions.md § Formulaire),
  // and an action the person does not have is left out rather than greyed.
  const [canAdd, setCanAdd] = useState(false);

  useEffect(() => {
    let live = true;
    listEntries(formSlug).then((list) => live && setEntries(list));
    if (formSlug) {
      canAddEntry(formSlug).then((allowed) => live && setCanAdd(allowed));
    }
    return () => {
      live = false;
    };
  }, [formSlug]);

  const formName = entries?.[0]?.formName;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">
          {formSlug ? `Fiches${formName ? ` — ${formName}` : ""}` : "Toutes les fiches"}
        </h1>
        {formSlug && canAdd && (
          <Button asChild>
            <Link href={`/fiches?nouvelle&formulaire=${formSlug}`}>
              <FilePlus2 />
              Nouvelle fiche
            </Link>
          </Button>
        )}
      </div>

      {entries === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune fiche pour l&apos;instant.
        </p>
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => (
            <li
              key={entry.slug}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/${entry.slug}`} className="truncate font-medium hover:underline">
                  {entry.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {!formSlug && <>{entry.formName} · </>}
                  modifiée le {formatDateTime(entry.updatedAt)}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${entry.slug}/edit`}>
                  <Pencil />
                  Éditer
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewEntryView({ formSlug }: { formSlug: string }) {
  const router = useRouter();
  const [form, setForm] = useState<EntryFormData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let live = true;
    getEntryForm(formSlug).then((data) => {
      if (!live) return;
      if (!data) setNotFound(true);
      setForm(data);
    });
    return () => {
      live = false;
    };
  }, [formSlug]);

  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Le formulaire «&nbsp;{formSlug}&nbsp;» est introuvable.
      </p>
    );
  }
  if (!form) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`/fiches?formulaire=${formSlug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Fiches
      </Link>
      <h1 className="text-lg font-semibold">Nouvelle fiche — {form.formName}</h1>
      <EntryForm form={form} onCreated={(slug) => router.push(`/${slug}`)} />
    </div>
  );
}
