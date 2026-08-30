import type { FieldWidgetSpec } from "@/modules/forms/field-widget";
import { type FormField, isOptionsField } from "@/modules/forms/form-descriptor";

// Adapts a descriptor FormField to the flat FieldWidgetSpec the shared
// renderer consumes (ADR 0015). Form-sourced options are resolved at the
// call site (their labels are entry titles, fetched at runtime) and passed
// in; inline options come straight from the field.
export function toWidgetSpec(
  field: FormField,
  resolvedOptions?: Record<string, string>
): FieldWidgetSpec {
  const spec: FieldWidgetSpec = {
    type: field.type,
    label: field.label,
    hint: field.hint,
    // A manual title is always required by the derived schema, whatever the
    // descriptor says: the widget must show it (deriveEntrySchema, ADR 0015).
    required: field.type === "title" ? true : field.required,
  };
  if ("placeholder" in field) spec.placeholder = field.placeholder;
  if (field.type === "text") {
    spec.subtype = field.subtype;
    spec.maxLength = field.maxLength;
  }
  if (field.type === "textarea") spec.rows = field.rows;
  if (field.type === "date") spec.initTodayButton = field.initTodayButton;
  if (isOptionsField(field)) {
    spec.options = resolvedOptions ?? field.options ?? {};
    if (field.type !== "list") spec.fillingMode = field.fillingMode;
  }
  if (field.type === "geolocation") {
    spec.streetField = field.streetField;
    spec.street1Field = field.street1Field;
    spec.street2Field = field.street2Field;
    spec.postalCodeField = field.postalCodeField;
    spec.townField = field.townField;
    spec.countyField = field.countyField;
    spec.stateField = field.stateField;
    spec.geolocateButton = field.geolocateButton;
  }
  if (field.type === "customContent") spec.entryContent = field.entryContent;
  // The widget's own name, to look its already-used values up (issue #15) —
  // no other field type needs it, so it stays out of the general shape above.
  if (field.type === "tags") spec.name = field.name;
  return spec;
}

/** The fields drawing options from another form, keyed by name → source slug. */
export function formSourcedFields(
  fields: FormField[]
): { name: string; sourceFormId: string }[] {
  return fields.flatMap((field) =>
    isOptionsField(field) && field.sourceFormId
      ? [{ name: field.name, sourceFormId: field.sourceFormId }]
      : []
  );
}
