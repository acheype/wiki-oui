import { getEntryForm } from "@/app/form-actions";
import { EntryForm as EntryFormClient } from "@/components/forms/entry-form";

// Built-in that inserts a form's entry form into any page (docs/forms.md).
// Its `id` is a form slug (form-list descriptor type); an unknown id renders
// an explicit notice rather than nothing, so a typo is visible.
export async function EntryForm({ id }: { id?: string }) {
  if (!id) {
    return (
      <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Aucun formulaire choisi pour ce formulaire de saisie.
      </p>
    );
  }
  const form = await getEntryForm(id);
  if (!form) {
    return (
      <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Formulaire introuvable : «&nbsp;{id}&nbsp;».
      </p>
    );
  }
  return (
    <div className="not-prose rounded-lg border p-4">
      <EntryFormClient form={form} />
    </div>
  );
}
