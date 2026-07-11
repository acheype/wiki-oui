import Link from "next/link";
import { isBlankMdx, renderMdx } from "@/lib/mdx";
import { getLayoutContents } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { wikiConfig } from "@/wiki.config";

// Site chrome (top bar, header slot, footer) around every wiki page. It
// lives in this route group so chrome-free pages can exist under /api —
// the ComponentBuilder preview (GET /api/render) only gets the root layout.

// Inline the paragraphs MDX produces: layout slots hold fragments, not prose.
const inlineMdx = "[&_p]:m-0 [&_p]:inline";

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const slots = await getLayoutContents();

  return (
    <>
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <Link
            href={`/${wikiConfig.homeSlug}`}
            className={cn("text-lg font-semibold tracking-tight", inlineMdx)}
          >
            {await renderMdx(slots.title)}
          </Link>
          <div className="layout-slot min-w-0 flex-1">
            {await renderMdx(slots.topMenu)}
          </div>
          <div
            className={cn(
              "layout-slot flex flex-wrap items-center gap-x-2",
              "text-sm text-muted-foreground",
              inlineMdx
            )}
          >
            {await renderMdx(slots.topQuickAccess)}
          </div>
        </div>
      </div>

      {!isBlankMdx(slots.header) && (
        <div className="border-b bg-muted/40">
          <div className={cn("mx-auto max-w-5xl px-4 py-3 text-sm", inlineMdx)}>
            {await renderMdx(slots.header)}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t">
        <div
          className={cn(
            "mx-auto max-w-5xl px-4 py-4 text-sm text-muted-foreground",
            inlineMdx
          )}
        >
          {await renderMdx(slots.footer)}
        </div>
      </footer>
    </>
  );
}
