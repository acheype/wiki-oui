"use client";

// The generated entry form (docs/forms.md, ADR 0015): one form built from a
// descriptor, shared by the three entry doors (<EntryForm>, /fiches?nouvelle,
// /{slug}/edit). react-hook-form + Zod resolver derived from the descriptor;
// the same schema validates server-side (form-actions.saveEntry).

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Save } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type EntryFormData, saveEntry } from "@/app/form-actions";
import { listFormOptions } from "@/app/form-actions";
import { Field } from "@/components/fields/field-widget";
import { SlugInlineEdit } from "@/components/ui/slug-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DESTINATION_PARAM } from "@/lib/destination";
import {
  type EntryData,
  deriveEntrySchema,
  initialEntryValues,
} from "@/lib/form-descriptor";
import { slugify } from "@/lib/slug";
import { authPagePath } from "@/wiki.config";
import { formSourcedFields, toWidgetSpec } from "./field-adapter";

export function EntryForm({
  form,
  onCreated,
}: {
  form: EntryFormData;
  /** Called after a successful create; defaults to navigating to the entry. */
  onCreated?: (slug: string) => void;
}) {
  // A form the person may not add to is shown with its motif and a follow-up
  // rather than hidden (docs/permissions.md § Ce que voit qui n'a pas le
  // droit): a block of content that vanished would read as a page that failed
  // to load, and leave the reader nothing to do about it. The three doors
  // share this component, so all three refuse the same way.
  if (form.slug === null && form.creationRefusal !== null) {
    return (
      <CreationRefused reason={form.creationRefusal} signedIn={form.signedIn} />
    );
  }
  return <EntryFields form={form} onCreated={onCreated} />;
}

/** The motif, and the one thing a visitor can do about it. */
function CreationRefused({
  reason,
  signedIn,
}: {
  reason: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{reason}</span>
      {/* Offered only to a visitor: someone already signed in has nothing to
          gain from signing in again, and the button would read as a promise. */}
      {!signedIn && (
        <Button asChild variant="outline" size="sm">
          <Link
            href={`${authPagePath("signIn")}?${DESTINATION_PARAM}=${encodeURIComponent(pathname)}`}
          >
            Se connecter
          </Link>
        </Button>
      )}
    </div>
  );
}

function EntryFields({
  form,
  onCreated,
}: {
  form: EntryFormData;
  onCreated?: (slug: string) => void;
}) {
  const router = useRouter();
  // Derived from what this person may *fill*, which is the schema the server
  // validates against too — one source of truth (ADR 0015). The greyed fields
  // are left out: they are on screen and disabled, so asking them for a value
  // would refuse a save over a field whose emptiness is not the author's to
  // fix, and the server ignores what comes back on them anyway.
  const schema = useMemo(
    () =>
      deriveEntrySchema({
        ...form.schema,
        fields: form.schema.fields.filter(
          (field) => !(field.name in form.readOnly)
        ),
      }),
    [form.schema, form.readOnly]
  );
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

  const [slugCustomized, setSlugCustomized] = useState(false);
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  // Live sibling values, for the geolocation field's address geocoding and
  // the live-derived entry identifier.
  const entryValues = useWatch({ control });

  const titleField = form.schema.fields.find((field) => field.type === "title");
  const automaticTitle =
    titleField?.type === "title" && titleField.automatic === true;

  // The identifier derives live from the title until personalized (unified
  // rule, ADR 0017); with an automatic title it stays empty client-side and
  // the server derives it from the computed title at save.
  const titleValue = entryValues?.title;
  const displayedSlug = slugCustomized
    ? slug
    : slugify(typeof titleValue === "string" ? titleValue : "");

  function submit(data: EntryData) {
    startTransition(async () => {
      const result = await saveEntry({
        formSlug: form.formSlug,
        data,
        slug: slugCustomized && slug !== "" ? slug : undefined,
        entrySlug: form.slug ?? undefined,
      });
      if (result.ok) {
        if (onCreated && !isEdit) onCreated(result.slug);
        else router.push(`/${result.slug}`);
      } else if (result.slugCollision) {
        toast.error(
          "Cet identifiant de fiche est déjà pris : personnalisez-le."
        );
      } else {
        toast.error(result.formError ?? "L'enregistrement a échoué.");
      }
    });
  }

  const identity = !isEdit ? (
    <EntryIdentity
      slug={displayedSlug}
      onChange={(value) => {
        setSlugCustomized(true);
        setSlug(value);
      }}
      onBlur={() => {
        if (slug === "") setSlugCustomized(false);
      }}
    />
  ) : null;

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
        const refusal = form.readOnly[field.name];
        const controller = (
          <Controller
            name={field.name}
            control={control}
            render={({ field: rhf }) => (
              <Field
                id={`entry-${field.name}`}
                spec={toWidgetSpec(field, sourced[field.name])}
                value={(rhf.value ?? "") as never}
                // An entry value has a single empty spelling, "" — the one
                // initialEntryValues writes. The shared widgets clear to
                // `undefined` instead, the ComponentBuilder's "prop absent"
                // (its omission rule, lib/component-descriptor generateTag);
                // react-hook-form reads that `undefined` as "no value here"
                // and serves the field's default back, so an emptied field
                // would show the stored value again.
                onChange={(value) => rhf.onChange(value ?? "")}
                error={errors[field.name]?.message as string | undefined}
                environment={{ entryValues, formSlug: form.formSlug }}
              />
            )}
          />
        );
        const widget = refusal ? (
          <ReadOnlyField reason={refusal}>{controller}</ReadOnlyField>
        ) : (
          controller
        );
        // The identifier row sits right under the (manual) title field.
        if (field.type === "title" && identity) {
          return (
            <Fragment key={field.name}>
              {widget}
              {identity}
            </Fragment>
          );
        }
        return <Fragment key={field.name}>{widget}</Fragment>;
      })}

      {/* No title widget when it is automatic: the row closes the form. */}
      {automaticTitle && identity}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {isEdit ? "Enregistrer" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A field this person may see but not fill (docs/permissions.md § Champ):
 * shown greyed, with the motif its rule was posed in. Made unreachable by a
 * `fieldset`, which disables every control it holds — the keyboard included,
 * where a dimmed-looking widget would still take a caret. Hiding it instead
 * would leave the fiche looking incomplete, and the value is on screen: what
 * is missing is the right to move it.
 */
function ReadOnlyField({
  reason,
  children,
}: {
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset disabled className="grid min-w-0 gap-1.5 opacity-70">
      {children}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {reason}
      </p>
    </fieldset>
  );
}

// The entry's identifier (docs/forms.md, ADR 0017 unified rule): an
// inline-editable chip under the title field (closing the form when the
// title is automatic), derived live from the title until personalized,
// frozen on first save. Creation only.
function EntryIdentity({
  slug,
  onChange,
  onBlur,
}: {
  slug: string;
  onChange: (slug: string) => void;
  /** Leaving the input empty re-derives the identifier from the title. */
  onBlur: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="entry-slug" className="gap-1">
          Identifiant
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <SlugInlineEdit
          id="entry-slug"
          value={slug}
          className="h-8 w-64"
          editLabel="Personnaliser l'identifiant"
          onValueChange={onChange}
          onBlur={onBlur}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Généré à partir du titre ou personnalisable. Minuscules, chiffres et
        tirets uniquement.
      </p>
    </div>
  );
}
