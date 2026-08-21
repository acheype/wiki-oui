import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getEntryForm } from "@/modules/forms/actions";
import { PageEditor } from "@/modules/authoring/page-editor";
import { EntryEdit } from "@/modules/forms/ui/entry-edit";
import { AccessRefused } from "@/modules/pages/ui/access-refused";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";
import { hasForm } from "@/modules/pages/entry-page";
import { getPageWithForm, listPageSlugs, listPageTags } from "@/modules/pages/content";
import { isRefused, personCanCreatePage, personCanWrite } from "@/modules/pages/rights";
import { CREATE_REFUSED, WRITE_REFUSED } from "@/modules/permissions/rules";
import { isValidSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Modifier ${decodeURIComponent(slug)} — WikiOui` };
}

export default async function EditPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);

  const lowercased = slug.toLowerCase();
  if (slug !== lowercased && isValidSlug(lowercased)) {
    redirect(`/${lowercased}/edit`);
  }
  if (!isValidSlug(slug)) {
    notFound();
  }

  const existing = await getPageWithForm(slug);
  if (existing && isRefused(existing)) {
    return <AccessRefused slug={slug} ownerName={existing.ownerName} />;
  }

  // The editor is reached by its address as well as by the hidden « Modifier »
  // button, so the write right is checked here too — with its own wording,
  // since « vous n'avez pas accès » would be untrue of a page one can read.
  if (existing && !(await personCanWrite(existing))) {
    return (
      <AccessRefused
        slug={slug}
        ownerName={existing.owner?.name ?? null}
        message={WRITE_REFUSED}
      />
    );
  }
  if (!existing && !(await personCanCreatePage())) {
    return (
      <AccessRefused slug={slug} ownerName={null} message={CREATE_REFUSED} />
    );
  }

  // A form entry (ADR 0014) edits through its generated form, never
  // CodeMirror: branch on the page's nature before loading editor data.
  if (existing && hasForm(existing)) {
    const form = await getEntryForm(existing.form.slug, slug);
    if (!form) notFound();
    return <EntryEdit form={form} />;
  }

  const [allSlugs, allTags, builders] = await Promise.all([
    listPageSlugs(),
    listPageTags(),
    loadComponentBuilders(),
  ]);

  return (
    <PageEditor
      slug={slug}
      initialContent={existing?.current?.content ?? ""}
      initialTags={existing?.tags ?? []}
      allSlugs={allSlugs}
      allTags={allTags}
      builders={builders}
      isNew={!existing}
    />
  );
}
