"use client";

// The FormBuilder (docs/forms.md, ADR 0014): builds a form's JSON descriptor
// — palette of field types, a sortable canvas, a per-field settings panel,
// and a template tab. The header name derives the form slug (fixed identity).
// Saving validates through the shared engine (lib/form-descriptor) server-side.

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
import { ChevronRight, GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type FormDetail,
  type SaveFormResult,
  saveForm,
} from "@/app/form-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES,
  type FormDescriptor,
  type FormField,
  type FormFieldType,
} from "@/lib/form-descriptor";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { FieldSettings } from "./field-settings";

// A canvas field: the descriptor field plus builder-only bookkeeping. `_id`
// is a stable drag key (names can transiently collide while editing); the
// identity flags drive the name reveal/freeze (ADR 0014).
export type CanvasField = FormField & {
  _id: string;
  nameRevealed?: boolean;
  /** True once the form has been saved: the name is immutable. */
  frozen?: boolean;
};

let nextId = 0;
const freshId = () => `field-${nextId++}`;

// The default title field present in every new form (docs/forms.md).
function titleField(frozen: boolean): CanvasField {
  return {
    _id: freshId(),
    type: "title",
    name: "title",
    label: "Titre de la fiche",
    frozen,
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
    frozen: true,
  }));
}

// Strips the builder-only bookkeeping back to a plain descriptor for saving.
function toDescriptor(fields: CanvasField[]): FormDescriptor {
  return {
    fields: fields.map(({ _id, nameRevealed, frozen, ...field }) => {
      void _id;
      void nameRevealed;
      void frozen;
      return field;
    }),
  };
}

export function FormBuilder({
  initial,
  forms,
  onSaved,
}: {
  /** Loaded form when editing; null for a new form. */
  initial: FormDetail | null;
  /** Other forms, for the form-list and options-source pickers. */
  forms: { slug: string; name: string }[];
  onSaved: (slug: string) => void;
}) {
  const isNew = initial === null;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugRevealed, setSlugRevealed] = useState(false);
  const [fields, setFields] = useState<CanvasField[]>(
    initial ? toCanvas(initial.schema) : [titleField(false)]
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    fields[0]?._id ?? null
  );
  const [template, setTemplate] = useState(initial?.template ?? "");
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

  // Slug derives from the name until revealed and customized (ADR 0014);
  // frozen once the form exists.
  function onNameChange(value: string) {
    setName(value);
    if (isNew && !slugRevealed) setSlug(slugify(value));
  }

  function save() {
    startTransition(async () => {
      const result: SaveFormResult = await saveForm({
        slug,
        name,
        schema: toDescriptor(fields),
        template,
        isNew,
      });
      if (result.ok) {
        toast.success("Formulaire enregistré.");
        onSaved(slug);
      } else {
        for (const issue of result.issues) toast.error(issue.message);
        // Point the canvas at the first field-anchored problem.
        const anchored = result.issues.find(
          (issue) => issue.fieldIndex !== undefined
        );
        if (anchored?.fieldIndex !== undefined) {
          setSelectedId(fields[anchored.fieldIndex]?._id ?? null);
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="form-name">Nom du formulaire</Label>
          <Input
            id="form-name"
            value={name}
            placeholder="ex. Annuaire des membres"
            onChange={(event) => onNameChange(event.target.value)}
          />
          <SlugReveal
            isNew={isNew}
            revealed={slugRevealed}
            slug={slug}
            onReveal={() => setSlugRevealed(true)}
            onChange={(value) => setSlug(slugify(value))}
          />
        </div>
        <Button onClick={save} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Enregistrer
        </Button>
      </div>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Champs</TabsTrigger>
          <TabsTrigger value="template">Gabarit</TabsTrigger>
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
                  onChange={(patch) => updateField(selected._id, patch)}
                  onRevealName={() =>
                    updateField(selected._id, { nameRevealed: true } as Partial<FormField>)
                  }
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
      </Tabs>
    </div>
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
        <span className="truncate text-sm font-medium">{field.label}</span>
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

function SlugReveal({
  isNew,
  revealed,
  slug,
  onReveal,
  onChange,
}: {
  isNew: boolean;
  revealed: boolean;
  slug: string;
  onReveal: () => void;
  onChange: (slug: string) => void;
}) {
  // An existing form's slug is frozen (ADR 0014): shown, never edited.
  if (!isNew) {
    return (
      <p className="text-xs text-muted-foreground">
        Identifiant : <code className="font-mono">{slug}</code> (figé)
      </p>
    );
  }
  if (!revealed) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className="flex items-center gap-1 justify-self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-3.5" aria-hidden />
        Identifiant : <code className="font-mono">{slug || "…"}</code>
      </button>
    );
  }
  return (
    <Input
      value={slug}
      className="h-8 font-mono text-xs"
      placeholder="identifiant"
      onChange={(event) => onChange(event.target.value)}
    />
  );
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
