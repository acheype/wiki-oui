"use client";

// The entry `edit` handler body (docs/forms.md): opens the generated form
// pre-filled from the snapshot, never CodeMirror. A thin client wrapper so
// the edit route can stay a server component.

import Link from "next/link";
import type { EntryFormData } from "@/modules/forms/entry-actions";
import { EntryForm } from "./entry-form";

export function EntryEdit({ form }: { form: EntryFormData }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">
          Modifier la fiche
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {form.formName}
          </span>
        </h1>
        {form.slug && (
          <Link
            href={`/${form.slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Annuler
          </Link>
        )}
      </div>
      <EntryForm form={form} />
    </div>
  );
}
