"use client";

// The generated entry form (docs/forms.md, ADR 0015): one form built from a
// descriptor, shared by the three entry doors (<EntryForm>, /fiches?nouvelle,
// /{slug}/edit). react-hook-form + Zod resolver derived from the descriptor;
// the same schema validates server-side (form-actions.saveEntry).

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type EntryFormData, saveEntry } from "@/app/form-actions";
import { listFormOptions } from "@/app/form-actions";
import { Field } from "@/components/fields/field-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type EntryData,
  deriveEntrySchema,
  initialEntryValues,
} from "@/lib/form-descriptor";
import { slugify } from "@/lib/slug";
import { formSourcedFields, toWidgetSpec } from "./field-adapter";

export function EntryForm({
  form,
  onCreated,
}: {
  form: EntryFormData;
  /** Called after a successful create; defaults to navigating to the entry. */
  onCreated?: (slug: string) => void;
}) {
  const router = useRouter();
  const schema = useMemo(() => deriveEntrySchema(form.schema), [form.schema]);
  const isEdit = form.slug !== null;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EntryData>({
    // The derived schema is dynamic (its keys come from the descriptor), so
    // its precise Zod type is opaque to the resolver's overloads — the cast
    // bridges @hookform/resolvers v5 and zod v4 here.
    resolver: zodResolver(schema as never),
    defaultValues: initialEntryValues(form.schema, form.values ?? undefined),
  });

  // Form-sourced options: value = entry slug, label = its current title.
  const [sourced, setSourced] = useState<Record<string, Record<string, string>>>(
    {}
  );
  useEffect(() => {
    let live = true;
    Promise.all(
      formSourcedFields(form.schema.fields).map(async ({ name, sourceFormId }) => {
        const options = await listFormOptions(sourceFormId);
        return [name, Object.fromEntries(options.map((o) => [o.value, o.label]))] as const;
      })
    ).then((entries) => {
      if (live) setSourced(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [form.schema]);

  const [slugRevealed, setSlugRevealed] = useState(false);
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  // Live sibling values, for the geolocation field's address geocoding.
  const entryValues = useWatch({ control });

  const titleField = form.schema.fields.find((field) => field.type === "title");
  const automaticTitle =
    titleField?.type === "title" && titleField.automatic === true;

  function submit(data: EntryData) {
    startTransition(async () => {
      const result = await saveEntry({
        formSlug: form.formSlug,
        data,
        slug: slugRevealed ? slug : undefined,
        entrySlug: form.slug ?? undefined,
      });
      if (result.ok) {
        if (onCreated && !isEdit) onCreated(result.slug);
        else router.push(`/${result.slug}`);
      } else if (result.slugCollision) {
        setSlugRevealed(true);
        toast.error(
          "Ce nom de fiche est déjà pris : choisissez-en un autre ci-dessous."
        );
      } else {
        toast.error(result.formError ?? "L'enregistrement a échoué.");
      }
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(submit)}>
      {form.schema.fields.map((field) => {
        // Automatic title is computed on save, never entered.
        if (field.type === "title" && automaticTitle) return null;
        // customContent carries no value: render it outside the controller.
        if (field.type === "customContent") {
          return (
            <Field
              key={field.name}
              id={`entry-${field.name}`}
              spec={toWidgetSpec(field)}
              value=""
              onChange={() => {}}
            />
          );
        }
        return (
          <Controller
            key={field.name}
            name={field.name}
            control={control}
            render={({ field: rhf }) => (
              <Field
                id={`entry-${field.name}`}
                spec={toWidgetSpec(field, sourced[field.name])}
                value={(rhf.value ?? "") as never}
                onChange={rhf.onChange}
                error={errors[field.name]?.message as string | undefined}
                environment={{ entryValues }}
              />
            )}
          />
        );
      })}

      {!isEdit && (
        <SlugField
          revealed={slugRevealed}
          slug={slug}
          onReveal={() => setSlugRevealed(true)}
          onChange={setSlug}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {isEdit ? "Enregistrer" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}

// The entry slug (docs/forms.md): derived from the title, hidden, revealable
// in one click to personalize, then frozen on first save. Shown only when
// creating; a collision reveals it automatically.
function SlugField({
  revealed,
  slug,
  onReveal,
  onChange,
}: {
  revealed: boolean;
  slug: string;
  onReveal: () => void;
  onChange: (slug: string) => void;
}) {
  if (!revealed) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className="flex items-center gap-1 justify-self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-3.5" aria-hidden />
        Personnaliser l&apos;adresse de la fiche
      </button>
    );
  }
  return (
    <div>
      <Label htmlFor="entry-slug" className="mb-2">
        Adresse de la fiche (slug)
      </Label>
      <Input
        id="entry-slug"
        value={slug}
        placeholder="dérivée du titre si vide"
        onChange={(event) => onChange(slugify(event.target.value))}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Laissée vide, elle est dérivée du titre. Figée après la première
        sauvegarde.
      </p>
    </div>
  );
}
