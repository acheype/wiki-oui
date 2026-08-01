"use client";

// The FormBuilder (docs/forms.md, ADR 0014): builds a form's JSON descriptor
// — palette of field types, a sortable canvas, a per-field settings panel,
// a template tab and a rights tab. The header name derives the form slug
// (fixed identity). Saving validates through the shared engine
// (lib/form-descriptor) server-side.

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type FormDetail,
  type SaveFormResult,
  applyEntryDefaults,
  countEntryDefaults,
  countFormReferences,
  countTitleImpact,
  renameForm,
  saveForm,
} from "@/app/form-actions";
import { NO_FLOOR } from "@/components/fields/acl-input";
import { Field } from "@/components/fields/field-widget";
import { InfoNote } from "@/components/ui/info-note";
import type { TitleRecomputeImpact } from "@/lib/entry-title-db";
import {
  type EntryRightsImpact,
  type FormPermissions,
  appliesNothing,
  bornFormPermissions,
  entryRightsNote,
} from "@/lib/form-rights";
import {
  type AccessRule,
  type AclDirectory,
  FORM_EDIT_REFUSED,
} from "@/lib/permissions";
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
import {
  RenameSlugDialog,
  impactParts,
  impactTotal,
} from "@/components/slug/rename-slug-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SlugInlineEdit } from "@/components/slug/slug-input";
import {
  countFieldReferenceUses,
  renameFieldBindings,
  renameFieldReferences,
} from "@/lib/field-rename";
import {
  FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES,
  type FormDescriptor,
  type FormDescriptorIssue,
  type FormField,
  type FormFieldType,
  formAuthoringIssues,
} from "@/lib/form-descriptor";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";
import { FieldSettings } from "./field-settings";

// A canvas field: the descriptor field plus builder-only bookkeeping. `_id`
// is a stable drag key (names can transiently collide while editing); the
// identity fields drive the derive/freeze rule (ADR 0014/0017).
export type CanvasField = FormField & {
  _id: string;
  /** True once the author typed in the identifier input: it stops deriving
   * from the label — emptied, it derives again (ADR 0017). */
  nameCustomized?: boolean;
  /** The name still in database, set for loaded fields; a staged rename
   * makes `name` differ from it until the form is saved (ADR 0017). */
  persistedName?: string;
};

let nextId = 0;
const freshId = () => `field-${nextId++}`;

/**
 * Which button asked for a save. The title-recompute confirmation sits
 * between the click and the write (ADR 0020), so what resumes on the other
 * side of it has to be remembered — applying the defaults saves too, and must
 * not come back as a plain save.
 */
type SaveIntent = "save" | "apply";

// The default title field present in every new form (docs/forms.md). The
// palette names the type explicitly ("Titre de la fiche"); the label stored
// here is what an author fills in and a reader sees, where "Titre" suffices.
function titleField(): CanvasField {
  return {
    _id: freshId(),
    type: "title",
    name: "title",
    label: "Titre",
  };
}

function newField(type: FormFieldType): CanvasField {
  const label = FIELD_TYPE_LABELS[type];
  const base = { _id: freshId(), label, name: slugify(label) };
  if (type === "list" || type === "radio" || type === "multiChoice") {
    return { ...base, type, options: {} } as CanvasField;
  }
  return { ...base, type } as CanvasField;
}

function toCanvas(descriptor: FormDescriptor): CanvasField[] {
  return descriptor.fields.map((field) => ({
    ...field,
    _id: freshId(),
    persistedName: field.name,
  }));
}

// Strips the builder-only bookkeeping back to a plain descriptor for saving.
function toDescriptor(
  fields: CanvasField[],
  permissions: FormPermissions
): FormDescriptor {
  return {
    fields: fields.map(({ _id, nameCustomized, persistedName, ...field }) => {
      void _id;
      void nameCustomized;
      void persistedName;
      return field;
    }),
    permissions,
  };
}

export function FormBuilder({
  initial,
  forms,
  directory,
  onSaved,
  onRenamed,
}: {
  /** Loaded form when editing; null for a new form. */
  initial: FormDetail | null;
  /** Other forms, for the form-list and options-source pickers. */
  forms: { slug: string; name: string }[];
  /** Who the « Accès » tab's lists may name. */
  directory: AclDirectory;
  onSaved: (slug: string) => void;
  /** Called after « Changer l'identifiant », so the parent fixes its URL. */
  onRenamed?: (slug: string) => void;
}) {
  const isNew = initial === null;
  const canEdit = initial?.canEdit ?? true;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugCustomized, setSlugCustomized] = useState(false);
  const [fields, setFields] = useState<CanvasField[]>(
    initial ? toCanvas(initial.schema) : [titleField()]
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    fields[0]?._id ?? null
  );
  const [template, setTemplate] = useState(initial?.template ?? "");
  // A new form is born with the wiki's own three rules, copied (ADR 0026):
  // the tab opens on them, and saving writes the copy.
  const [permissions, setPermissions] = useState<FormPermissions>(
    initial?.permissions ?? bornFormPermissions()
  );
  /** Pending title recompute awaiting confirmation (ADR 0020). */
  const [titleImpact, setTitleImpact] = useState<TitleRecomputeImpact | null>(
    null
  );
  /** Which save that confirmation is holding up, so it resumes the right one. */
  const [titleIntent, setTitleIntent] = useState<SaveIntent>("save");
  /** Pending « Appliquer ces accès… » awaiting confirmation. */
  const [defaultsImpact, setDefaultsImpact] =
    useState<EntryRightsImpact | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor));
  const selected = fields.find((field) => field._id === selectedId) ?? null;

  const otherForms = useMemo(
    () => forms.filter((form) => form.slug !== initial?.slug),
    [forms, initial]
  );

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((current) =>
      current.map((field) =>
        field._id === id ? ({ ...field, ...patch } as CanvasField) : field
      )
    );
  }

  function addField(type: FormFieldType) {
    const field = newField(type);
    setFields((current) => [...current, field]);
    setSelectedId(field._id);
  }

  function removeField(id: string) {
    setFields((current) => current.filter((field) => field._id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((current) => {
      const from = current.findIndex((field) => field._id === active.id);
      const to = current.findIndex((field) => field._id === over.id);
      return arrayMove(current, from, to);
    });
  }

  // Slug derives from the name until customized (ADR 0014); once the form
  // exists it only moves through « Changer l'identifiant » (ADR 0016).
  function onNameChange(value: string) {
    setName(value);
    if (isNew && !slugCustomized) setSlug(slugify(value));
  }

  // Typing decouples the slug from the name (ADR 0017); the SlugInput
  // already normalized. The field may stay empty while editing — only
  // leaving it empty re-derives, so a cleared value does not spring back.
  function onSlugChange(slug: string) {
    setSlugCustomized(true);
    setSlug(slug);
  }

  function onSlugBlur() {
    if (slug === "") {
      setSlugCustomized(false);
      setSlug(slugify(name));
    }
  }

  function handleRenamed(newSlug: string) {
    setSlug(newSlug);
    toast.success("Identifiant modifié. Les références ont été mises à jour.");
    onRenamed?.(newSlug);
  }

  // A confirmed field rename stages locally (ADR 0017): the field's name,
  // the {champ} references of the template and automatic title, and the
  // geolocation bindings move together; everything applies at save.
  function stageFieldRename(id: string, to: string) {
    const from = fields.find((field) => field._id === id)?.name;
    if (from === undefined || from === to) return;
    const mapping = new Map([[from, to]]);
    setFields((current) =>
      current.map((field) => {
        const renamed = renameFieldBindings(field, mapping) ?? field;
        // Only the dialog's field changes name: a transient duplicate
        // elsewhere keeps its own (uniqueness is enforced at save).
        return {
          ...renamed,
          name: field._id === id ? to : field.name,
        } as CanvasField;
      })
    );
    setTemplate((current) => renameFieldReferences(current, mapping) ?? current);
  }

  /** Saves, and says whether it went through — the callers that follow it care. */
  async function persistOnly(): Promise<boolean> {
    // The staged renames (ADR 0017): every persisted field whose identifier
    // moved since load feeds the server's data-key retcon.
    const renames = fields.flatMap((field) =>
      field.persistedName !== undefined && field.persistedName !== field.name
        ? [{ from: field.persistedName, to: field.name }]
        : []
    );
    const result: SaveFormResult = await saveForm({
      slug,
      name,
      schema: toDescriptor(fields, permissions),
      template,
      isNew,
      renames,
    });
    if (!result.ok) {
      reportIssues(result.issues);
      return false;
    }
    return true;
  }

  async function persist() {
    if (!(await persistOnly())) return;
    toast.success("Formulaire enregistré.");
    onSaved(slug);
  }

  function reportIssues(issues: FormDescriptorIssue[]) {
    for (const issue of issues) toast.error(issue.message);
    // Point the canvas at the first field-anchored problem.
    const anchored = issues.find((issue) => issue.fieldIndex !== undefined);
    if (anchored?.fieldIndex !== undefined) {
      setSelectedId(fields[anchored.fieldIndex]?._id ?? null);
    }
  }

  /** Saves, then rewrites the rights of the form's fiches from its defaults. */
  async function persistAndApply() {
    if (!(await persistOnly())) return;
    const result = await applyEntryDefaults(slug, permissions);
    if (result) {
      toast.error(result.error);
      return;
    }
    toast.success("Formulaire enregistré, accès appliqués aux fiches.");
    onSaved(slug);
  }

  /**
   * What every save waits on, whichever button asked for it: an unfinished
   * form, then a title recompute the admin has to accept. False means
   * something stopped it — either reported, or now sitting behind a modal
   * that will resume it, which is why the intent travels with the count.
   */
  async function clearedToSave(intent: SaveIntent): Promise<boolean> {
    const descriptor = toDescriptor(fields, permissions);
    // Refuse an unfinished form before anything else. The title-recompute
    // confirmation below would otherwise announce entries being rewritten
    // by a save the server is about to turn down — and it is a modal, so
    // the refusal would arrive only after the admin had accepted it. Same
    // engine as saveForm's own verdict (ADR 0015); the server still owns
    // the decision, this only spares a confirmation that leads nowhere.
    const issues = formAuthoringIssues(descriptor);
    if (issues.length > 0) {
      reportIssues(issues);
      return false;
    }
    // Changing the automatic title's template — or switching it on —
    // rewrites the stored title of every entry (ADR 0020). The server
    // owns the detection and returns null when this save leaves the
    // titles alone; otherwise the admin sees the count first.
    if (!isNew) {
      const impact = await countTitleImpact(slug, descriptor);
      if (impact && impact.updated + impact.skipped > 0) {
        setTitleIntent(intent);
        setTitleImpact(impact);
        return false;
      }
    }
    return true;
  }

  function save() {
    startTransition(async () => {
      if (await clearedToSave("save")) await persist();
    });
  }

  /**
   * Applying the defaults to the fiches already there (docs/permissions.md §
   * Défauts): the one path from the defaults to what already exists. It counts
   * against the rules the tab shows rather than those in base — the action
   * saves the form on its way, so what the confirmation announces is what it is
   * about to hold, and the two cannot disagree.
   */
  function askToApply() {
    startTransition(async () => {
      const counted = await countEntryDefaults(slug, permissions);
      if ("error" in counted) {
        toast.error(counted.error);
        return;
      }
      if (counted.impact === null) {
        toast.error("Ce formulaire n'existe plus.");
        return;
      }
      setDefaultsImpact(counted.impact);
    });
  }

  // Accepted the numbers: the save the action drags along still passes the
  // checks a plain save does, so a gabarit changed in the same sitting cannot
  // rewrite every title on the quiet.
  function applyDefaults() {
    setDefaultsImpact(null);
    startTransition(async () => {
      if (await clearedToSave("apply")) await persistAndApply();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label htmlFor="form-name" className="gap-1">
              Nom du formulaire
              <span aria-hidden className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="form-name"
              value={name}
              placeholder="ex. Annuaire des membres"
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
          {/* Editing a form's definition is its owner's or an administrator's
              (docs/permissions.md): what the actor cannot do is left out of
              the header rather than greyed out, and the note says why. */}
          {canEdit ? (
            <Button onClick={save} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Enregistrer
            </Button>
          ) : (
            <InfoNote className="max-w-80">{FORM_EDIT_REFUSED}</InfoNote>
          )}
        </div>
        <FormIdentity
          isNew={isNew}
          canEdit={canEdit}
          slug={slug}
          onChange={onSlugChange}
          onBlur={onSlugBlur}
          onRenamed={handleRenamed}
        />
      </div>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Champs</TabsTrigger>
          <TabsTrigger value="template">Gabarit</TabsTrigger>
          <TabsTrigger value="rights">Accès</TabsTrigger>
        </TabsList>

        <TabsContent value="fields">
          <div className="grid gap-4 md:grid-cols-[12rem_1fr_18rem]">
            <Palette onAdd={addField} />

            <div className="rounded-lg border p-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={fields.map((field) => field._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-1.5">
                    {fields.map((field) => (
                      <CanvasRow
                        key={field._id}
                        field={field}
                        selected={field._id === selectedId}
                        onSelect={() => setSelectedId(field._id)}
                        onRemove={() => removeField(field._id)}
                      />
                    ))}
                    {fields.length === 0 && (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Ajoutez des champs depuis la palette.
                      </p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="rounded-lg border p-3">
              {selected ? (
                <FieldSettings
                  key={selected._id}
                  field={selected}
                  otherFields={fields.filter((f) => f._id !== selected._id)}
                  forms={otherForms}
                  formSlug={initial?.slug ?? null}
                  referenceCounts={countFieldReferenceUses(
                    fields,
                    template,
                    selected.name
                  )}
                  onChange={(patch) => updateField(selected._id, patch)}
                  onRenameStaged={(to) => stageFieldRename(selected._id, to)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un champ pour le paramétrer.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="template">
          <TemplateEditor
            template={template}
            fields={fields}
            onChange={setTemplate}
          />
        </TabsContent>

        <TabsContent value="rights">
          <RightsEditor
            permissions={permissions}
            directory={directory}
            // No fiche exists yet to apply anything to, and the form itself
            // is not in base: the button appears once there is something for
            // it to reach.
            onApply={isNew || !canEdit ? undefined : askToApply}
            applying={isPending}
            onChange={setPermissions}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={titleImpact !== null}
        onOpenChange={(open) => !open && setTitleImpact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Recalculer le titre des fiches ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {titleImpact && (
                <TitleImpactSentence impact={titleImpact} />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const resume =
                  titleIntent === "apply" ? persistAndApply : persist;
                setTitleImpact(null);
                startTransition(resume);
              }}
            >
              Enregistrer et recalculer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={defaultsImpact !== null}
        onOpenChange={(open) => !open && setDefaultsImpact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Appliquer ces accès aux fiches existantes ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {defaultsImpact && (
                <ImpactSentences {...entryRightsNote(defaultsImpact)} />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            {/* The button reads the same count the sentences do: it stays out
                of reach rather than reporting a success over fiches it would
                not have touched. */}
            <AlertDialogAction
              disabled={
                defaultsImpact !== null && appliesNothing(defaultsImpact)
              }
              onClick={applyDefaults}
            >
              Enregistrer et appliquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** What the count announces: the headline, then what it sets aside. */
function ImpactSentences({
  headline,
  lines,
}: {
  headline: string;
  lines: string[];
}) {
  return (
    <>
      {headline}
      {lines.map((line) => (
        <Fragment key={line}>
          <br />
          {line}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The « Accès » tab (docs/permissions.md § Formulaire : trois réglages, pas
 * deux). Three settings and not two: creating a fiche and modifying one
 * already there are distinct rights, and confusing them would break « chacun
 * propose un événement, chacun ne modifie que le sien ».
 *
 * A tab rather than a strip at the foot of the canvas, which is the target of
 * the drag & drop.
 */
function RightsEditor({
  permissions,
  directory,
  onApply,
  applying,
  onChange,
}: {
  permissions: FormPermissions;
  directory: AclDirectory;
  /** Absent on a new form, and on one the actor may not save. */
  onApply?: () => void;
  applying: boolean;
  onChange: (permissions: FormPermissions) => void;
}) {
  function set(patch: Partial<FormPermissions>) {
    onChange({ ...permissions, ...patch });
  }

  // Two boxes rather than one with two rules inside it. A rule separates
  // peers, so a card holding the creation rule, the defaults and the action
  // made three of them — and the action, sitting under the last rule, could
  // be read as applying the first. What contains a thing says what it belongs
  // to more surely than what it sits next to, so each subject gets its own
  // frame and the action is inside the one whose title names what it applies.
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="rounded-lg border p-4">
        <Field
          id="form-create-acl"
          spec={{ type: "acl", label: "Qui peut créer une fiche ?" }}
          value={permissions.createEntry}
          environment={{ directory, aclFloor: NO_FLOOR }}
          onChange={(value) => set({ createEntry: value as AccessRule })}
        />
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">
            Accès par défaut d&apos;une fiche
          </p>
          <InfoNote className="mt-1">
            Appliqué uniquement à la création d&apos;une fiche. Les fiches
            existantes ne sont pas modifiées.
          </InfoNote>
        </div>
        <Field
          id="form-read-acl"
          spec={{ type: "acl", label: "Qui peut la voir ?" }}
          value={permissions.defaultEntryRead}
          environment={{ directory, aclFloor: NO_FLOOR }}
          onChange={(value) => set({ defaultEntryRead: value as AccessRule })}
        />
        <Field
          id="form-write-acl"
          spec={{ type: "acl", label: "Qui peut la modifier ?" }}
          value={permissions.defaultEntryWrite}
          environment={{ directory, aclFloor: NO_FLOOR }}
          onChange={(value) => set({ defaultEntryWrite: value as AccessRule })}
        />
        {/* Behind a separator, and deliberately: the two settings above are
            saved by « Enregistrer » like anything else, and an action glued
            to them would suggest they only take effect through it. Inside the
            box now, so the rule separates without detaching. */}
        {onApply && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={applying}
              onClick={onApply}
            >
              {applying ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShieldCheck />
              )}
              Appliquer aux fiches existantes
            </Button>
            <p className="text-xs text-muted-foreground">
              Applique les accès par défaut à toutes les fiches existantes. Le
              nombre de fiches concernées est affiché avant confirmation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// What the recompute is about to do (ADR 0020). The skipped count is the
// actionable half: those entries keep their title because the template has
// nothing to work with, and the admin is the only one who can fix them.
function TitleImpactSentence({ impact }: { impact: TitleRecomputeImpact }) {
  const { updated, skipped } = impact;
  return (
    <>
      {updated > 0 ? (
        <>
          <strong>{updated}</strong> fiche{updated > 1 ? "s" : ""} verr
          {updated > 1 ? "ont" : "a"} son titre recalculé depuis le nouveau
          gabarit.
        </>
      ) : (
        <>Aucune fiche ne change de titre.</>
      )}
      {skipped > 0 && (
        <>
          <br />
          <strong>{skipped}</strong> fiche conserver{skipped > 1 ? "ont" : "a"} le
          sien : le gabarit produit une chaîne vide pour {skipped > 1 ? "elles" : "elle"}.
        </>
      )}
    </>
  );
}

function Palette({ onAdd }: { onAdd: (type: FormFieldType) => void }) {
  return (
    <div className="grid h-fit gap-1.5">
      {FORM_FIELD_TYPES.filter((type) => type !== "title").map((type) => (
        <Button
          key={type}
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => onAdd(type)}
        >
          <Plus />
          {FIELD_TYPE_LABELS[type]}
        </Button>
      ))}
    </div>
  );
}

function CanvasRow({
  field,
  selected,
  onSelect,
  onRemove,
}: {
  field: CanvasField;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field._id });
  const removable = field.type !== "title";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5",
        selected && "border-primary ring-1 ring-primary",
        isDragging && "opacity-50"
      )}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground"
        aria-label="Déplacer le champ"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="truncate text-sm font-medium">
          {field.label}
          {field.required && (
            <span aria-hidden className="text-destructive">
              {" "}
              *
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {FIELD_TYPE_LABELS[field.type]}
        </span>
      </button>
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Supprimer le champ"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

// The form's identity, under its name (docs/forms.md, ADR 0014/0016/0017).
// New form: an inline-editable chip, derived from the name until the author
// types in it (left empty, it derives again). Existing form: a plain chip,
// and only « Changer » can move it (the ADR 0016 retcon dialog).
function FormIdentity({
  isNew,
  canEdit,
  slug,
  onChange,
  onBlur,
  onRenamed,
}: {
  isNew: boolean;
  /** Owner or administrator: « Changer » is theirs alone, like the save. */
  canEdit: boolean;
  slug: string;
  onChange: (slug: string) => void;
  /** Leaving the input empty re-derives the slug from the name. */
  onBlur: () => void;
  onRenamed: (slug: string) => void;
}) {
  if (!isNew) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Identifiant</p>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          {slug}
        </code>
        {canEdit && (
          <RenameSlugDialog
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <Pencil className="size-3.5" />
                Changer
              </Button>
            }
            title="Changer l'identifiant du formulaire"
            currentLabel="Identifiant actuel"
            current={slug}
            inputLabel="Nouvel identifiant"
            confirmLabel="Changer l'identifiant"
            searchingText="Recherche des utilisations de cet identifiant…"
            impactSentence={formImpactSentence}
            fetchImpact={() => countFormReferences(slug)}
            rename={(newSlug) => renameForm(slug, newSlug)}
            onRenamed={onRenamed}
          />
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="form-slug" className="gap-1">
          Identifiant
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <SlugInlineEdit
          id="form-slug"
          value={slug}
          className="h-8 w-64"
          editLabel="Personnaliser l'identifiant"
          onValueChange={onChange}
          onBlur={onBlur}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Généré à partir du nom ou personnalisable. Minuscules, chiffres et
        tirets uniquement.
      </p>
    </div>
  );
}

function formImpactSentence(impact: SlugReferenceImpact): string {
  const parts = impactParts(impact);
  if (parts === null) {
    return "Rien n'utilise cet identifiant dans le wiki.";
  }
  const verb = impactTotal(impact) > 1 ? "utilisent" : "utilise";
  return `${parts} ${verb} cet identifiant : les références seront mises à jour automatiquement, historique compris.`;
}

// The optional MDX template that lays out an entry at render (docs/forms.md):
// a plain textarea plus the list of available {champ} references. The rich
// CodeMirror editor with live preview is a refinement.
function TemplateEditor({
  template,
  fields,
  onChange,
}: {
  template: string;
  fields: CanvasField[];
  onChange: (template: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Vide, un rendu par défaut est généré. Sinon, écrivez du MDX où les
        <code className="mx-1 font-mono">{"{champ}"}</code> sont remplacés par
        les valeurs de la fiche.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <code
            key={field._id}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
          >
            {`{${field.name}}`}
          </code>
        ))}
      </div>
      <Textarea
        value={template}
        rows={12}
        className="font-mono text-sm"
        placeholder={"# {title}\n\n{description}"}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
