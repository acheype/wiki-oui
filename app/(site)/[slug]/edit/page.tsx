import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getEntryForm } from "@/app/form-actions";
import { PageEditor } from "@/components/editor/page-editor";
import { EntryEdit } from "@/components/forms/entry-edit";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { prisma } from "@/lib/prisma";
import { getPageWithCurrent, listPageSlugs } from "@/lib/pages";
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

  // A form entry (ADR 0014) edits through its generated form, never
  // CodeMirror: branch on the page's nature before loading editor data.
  const existing = await prisma.page.findUnique({
    where: { slug },
    include: { form: true },
  });
  if (existing?.form) {
    const form = await getEntryForm(existing.form.slug, slug);
    if (!form) notFound();
    return <EntryEdit form={form} />;
  }

  const [page, allSlugs, builders] = await Promise.all([
    getPageWithCurrent(slug),
    listPageSlugs(),
    loadComponentBuilders(),
  ]);

  return (
    <PageEditor
      slug={slug}
      initialContent={page?.current?.content ?? ""}
      initialTags={page?.tags ?? []}
      allSlugs={allSlugs}
      builders={builders}
      isNew={!page}
    />
  );
}
