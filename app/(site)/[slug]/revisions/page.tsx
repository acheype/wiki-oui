import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CodeToggle } from "@/components/revisions/code-toggle";
import { DiffView } from "@/components/revisions/diff-view";
import { RestoreButton } from "@/components/revisions/restore-button";
import { RevisionTimeline } from "@/components/revisions/timeline";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { renderMdx } from "@/lib/mdx";
import { getPageWithRevisions } from "@/lib/pages";
import { isValidSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VIEWS = [
  ["apercu", "Aperçu"],
  ["modifications", "Modifications"],
  ["courante", "Différence avec la courante"],
] as const;

type ViewKey = (typeof VIEWS)[number][0];

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rev?: string; view?: string; code?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Historique de ${decodeURIComponent(slug)} — WikiOui` };
}

export default async function RevisionsPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent((await params).slug);

  const lowercased = slug.toLowerCase();
  if (slug !== lowercased && isValidSlug(lowercased)) {
    redirect(`/${lowercased}/revisions`);
  }
  if (!isValidSlug(slug)) {
    notFound();
  }

  const page = await getPageWithRevisions(slug);
  if (!page || page.revisions.length === 0) {
    redirect(`/${slug}`);
  }

  const query = await searchParams;
  const revisions = page.revisions; // oldest first
  // An entry's snapshot is JSON `data`, not MDX (ADR 0014); its history
  // views come with the entry screens (v0.3) — until then, show nothing.
  const sourceOf = (revision: { content: string | null }) =>
    revision.content ?? "";
  const current =
    revisions.find((revision) => revision.id === page.currentRevisionId) ??
    revisions[revisions.length - 1];
  const selected =
    revisions.find((revision) => revision.id === query.rev) ?? current;
  const selectedIndex = revisions.indexOf(selected);
  const previous = selectedIndex > 0 ? revisions[selectedIndex - 1] : null;
  const view: ViewKey = VIEWS.some(([key]) => key === query.view)
    ? (query.view as ViewKey)
    : "apercu";
  const showCode = query.code === "1";

  function viewHref(key: ViewKey) {
    const next = new URLSearchParams({ rev: selected.id, view: key });
    if (showCode) next.set("code", "1");
    return `?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          Historique de «&nbsp;{slug}&nbsp;»
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {revisions.length} révision{revisions.length > 1 ? "s" : ""}
          </span>
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${slug}`}>
            <ArrowLeft />
            Retour à la page
          </Link>
        </Button>
      </div>

      <RevisionTimeline
        selectedId={selected.id}
        revisions={revisions.map((revision) => ({
          id: revision.id,
          createdAt: revision.createdAt,
          authorName: revision.authorName,
          isCurrent: revision.id === current.id,
          isRestore: revision.restoredFromId !== null,
        }))}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/40 px-4 py-2.5 text-sm">
        <span>
          Révision du{" "}
          <strong className="font-medium">
            {formatDateTime(selected.createdAt)}
          </strong>{" "}
          par {selected.authorName ?? "Anonyme"}
        </span>
        {selected.restoredFrom && (
          <span className="text-muted-foreground">
            restauration de la révision du{" "}
            {formatDateTime(selected.restoredFrom.createdAt)}
          </span>
        )}
        <div className="ml-auto">
          {selected.id !== current.id && (
            <RestoreButton revisionId={selected.id} />
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b" aria-label="Vues de l'historique">
        {VIEWS.map(([key, label]) => (
          <Link
            key={key}
            href={viewHref(key)}
            replace
            scroll={false}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              view === key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "apercu" && (
        <div className="flex flex-col gap-4">
          <CodeToggle />
          {showCode ? (
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {sourceOf(selected)}
            </pre>
          ) : (
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              {await renderMdx(sourceOf(selected))}
            </article>
          )}
        </div>
      )}

      {view === "modifications" &&
        (previous ? (
          <DiffView from={sourceOf(previous)} to={sourceOf(selected)} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Première révision : création de la page.
            </p>
            <DiffView from="" to={sourceOf(selected)} />
          </div>
        ))}

      {view === "courante" &&
        (selected.id === current.id ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Cette révision est la révision courante.
          </p>
        ) : (
          <DiffView from={sourceOf(selected)} to={sourceOf(current)} />
        ))}
    </div>
  );
}
