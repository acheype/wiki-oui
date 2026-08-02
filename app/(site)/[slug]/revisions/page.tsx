import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntryView } from "@/components/forms/entry-view";
import { AccessRefused } from "@/components/page/access-refused";
import { Prose } from "@/components/page/prose";
import { CodeToggle } from "@/components/revisions/code-toggle";
import { DiffView } from "@/components/revisions/diff-view";
import { RestoreButton } from "@/components/revisions/restore-button";
import { RevisionTimeline } from "@/components/revisions/timeline";
import { Button } from "@/components/ui/button";
import { readableDescriptor, readableEntryData } from "@/lib/field-rights";
import { parseFormDescriptor, readEntryData } from "@/lib/form-descriptor";
import { formatDateTime } from "@/lib/format";
import { getFormById } from "@/lib/forms";
import { renderMdx } from "@/lib/mdx";
import { actorCanWrite, getPageWithRevisions, isRefused } from "@/lib/pages";
import { currentActor } from "@/lib/permissions-db";
import { isValidSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/username";

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
  if (!page) redirect(`/${slug}`);
  // The history is a read action, so a refusal lands on the same screen the
  // page itself would have shown — reached from its own address.
  if (isRefused(page)) {
    return <AccessRefused slug={slug} ownerName={page.ownerName} />;
  }
  if (page.revisions.length === 0) {
    redirect(`/${slug}`);
  }

  const query = await searchParams;
  const revisions = page.revisions; // oldest first
  // Reading the history is a read action, putting a revision back is a write
  // (docs/permissions.md § Quel droit commande quelle action): whoever may only
  // read gets the whole screen, minus the button.
  const writable = await actorCanWrite(page);

  // An entry snapshots JSON `data`, not MDX (ADR 0014): the code/diff views
  // work on a pretty-printed JSON of the values, the preview renders the
  // entry's default view (below).
  const form = page.formId ? await getFormById(page.formId) : null;
  const stored = form ? parseFormDescriptor(form.schema).descriptor ?? null : null;
  // The history is another way of reading a fiche, so the fields cut from its
  // rendering are cut from every revision of it too (docs/permissions.md §
  // Champ) — the JSON of a snapshot would otherwise hand over what the fiche
  // itself withholds.
  const actor = await currentActor();
  const entryDescriptor = stored ? readableDescriptor(actor, stored) : null;
  const valuesOf = (data: unknown) =>
    stored ? readableEntryData(actor, stored, readEntryData(data)) : {};
  const sourceOf = (revision: { content: string | null; data: unknown }) =>
    entryDescriptor
      ? JSON.stringify(valuesOf(revision.data), null, 2)
      : revision.content ?? "";
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
          authorName: displayName(revision.author),
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
          par {displayName(selected.author)}
        </span>
        {selected.restoredFrom && (
          <span className="text-muted-foreground">
            restauration de la révision du{" "}
            {formatDateTime(selected.restoredFrom.createdAt)}
          </span>
        )}
        <div className="ml-auto">
          {writable && selected.id !== current.id && (
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
            <article>
              {entryDescriptor ? (
                <EntryView
                  descriptor={entryDescriptor}
                  data={valuesOf(selected.data)}
                  linkTitles={{}}
                />
              ) : (
                <Prose>{await renderMdx(sourceOf(selected))}</Prose>
              )}
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
