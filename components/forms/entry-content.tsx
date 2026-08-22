import { EntryView } from "@/components/forms/entry-view";
import { Prose } from "@/components/page/prose";
import { readableForm } from "@/lib/field-rights-db";
import { renderTemplateSource } from "@/lib/entry-render";
import { formSourcedValues, readEntryData } from "@/lib/form-descriptor";
import { getFormById } from "@/lib/forms";
import { renderMdx } from "@/lib/mdx";
import { listPagesWithCurrent } from "@/lib/pages";

// The entry "show" rendering (ADR 0014), shared by the page at /[slug] and
// the chrome-free popup service (docs/entries-view.md): the form's MDX
// template with {champ} values substituted (escaped) compiled through the
// sandboxed pipeline, or the auto-generated default view without a template.
export async function EntryContent({
  formId,
  rawData,
  hideTitle = false,
}: {
  formId: string;
  rawData: unknown;
  /**
   * Drops the title from the default view, for a container that already names
   * the entry. A template is left untouched: its author decides where — and
   * whether — the title appears.
   */
  hideTitle?: boolean;
}): Promise<React.ReactNode> {
  const form = await getFormById(formId);
  if (!form) return null;
  // The second of the two moments (docs/permissions.md § Deux temps): which
  // fiches was a `where`, which fields inside them is settled here, in memory
  // — the rights of a field living in JSON no clause reaches.
  const seen = await readableForm(form.schema);
  if (!seen) return null;
  const data = seen.readableValues(rawData);

  if (form.template && form.template.trim() !== "") {
    // The whole descriptor, over the cut data: a `{salaire}` the template
    // names then renders as the empty string — the domain's silent rule for a
    // value that is not there (docs/forms.md) — where dropping the field would
    // leave the reference itself on the page.
    return (
      <Prose>
        {await renderMdx(
          renderTemplateSource(form.template, seen.whole, data)
        )}
      </Prose>
    );
  }

  // Resolve form-sourced option values (entry slugs) to their current titles
  // for the default view's wiki links; a deleted target keeps its raw slug.
  const referenced = formSourcedValues(seen.readable, data);
  const targets = referenced.length
    ? await listPagesWithCurrent(referenced)
    : [];
  const linkTitles: Record<string, string> = {};
  for (const target of targets) {
    const title = readEntryData(target.current?.data).title;
    if (typeof title === "string") linkTitles[target.slug] = title;
  }

  return (
    <EntryView
      descriptor={seen.readable}
      data={data}
      linkTitles={linkTitles}
      hideTitle={hideTitle}
    />
  );
}
