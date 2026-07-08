import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageEditor } from "@/components/editor/page-editor";
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

  const [page, allSlugs] = await Promise.all([
    getPageWithCurrent(slug),
    listPageSlugs(),
  ]);

  return (
    <PageEditor
      slug={slug}
      initialContent={page?.current?.content ?? ""}
      initialTags={page?.tags ?? []}
      allSlugs={allSlugs}
      isNew={!page}
    />
  );
}
