import { EntryView } from "@/components/forms/entry-view";
import { Prose } from "@/components/page/prose";
import { renderTemplateSource } from "@/lib/entry-render";
import {
  formSourcedValues,
  parseFormDescriptor,
  readEntryData,
} from "@/lib/form-descriptor";
import { renderMdx } from "@/lib/mdx";
import { prisma } from "@/lib/prisma";

// The entry "show" rendering (ADR 0014), shared by the page at /[slug] and
// the chrome-free popup service (docs/entries-view.md): the form's MDX
// template with {champ} values substituted (escaped) compiled through the
// sandboxed pipeline, or the auto-generated default view without a template.
export async function EntryContent({
  formId,
  rawData,
}: {
  formId: string;
  rawData: unknown;
}): Promise<React.ReactNode> {
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) return null;
  const data = readEntryData(rawData);

  if (form.template && form.template.trim() !== "") {
    return (
      <Prose>
        {await renderMdx(
          renderTemplateSource(form.template, parsed.descriptor, data)
        )}
      </Prose>
    );
  }

  // Resolve form-sourced option values (entry slugs) to their current titles
  // for the default view's wiki links; a deleted target keeps its raw slug.
  const referenced = formSourcedValues(parsed.descriptor, data);
  const targets = referenced.length
    ? await prisma.page.findMany({
        where: { slug: { in: referenced } },
        include: { current: true },
      })
    : [];
  const linkTitles: Record<string, string> = {};
  for (const target of targets) {
    const title = readEntryData(target.current?.data).title;
    if (typeof title === "string") linkTitles[target.slug] = title;
  }

  return (
    <EntryView
      descriptor={parsed.descriptor}
      data={data}
      linkTitles={linkTitles}
    />
  );
}
