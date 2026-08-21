import Link from "next/link";
import { AccountMenu } from "@/components/auth/account-menu";
import { isBlankMdx, renderMdx } from "@/lib/mdx";
import { getLayoutContents } from "@/modules/pages/content";
import { currentIdentity } from "@/modules/permissions/person";
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
  // Server-resolved: the top bar renders signed in or out on the first
  // paint, without the flash a client-side session fetch would bring.
  const identity = await currentIdentity();
  // The five slot renders are independent: pipeline them.
  const [title, topMenu, topQuickAccess, header, footer] = await Promise.all([
    renderMdx(slots.title),
    renderMdx(slots.topMenu),
    renderMdx(slots.topQuickAccess),
    renderMdx(slots.header),
    renderMdx(slots.footer),
  ]);

  return (
    <>
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <Link
            href={`/${wikiConfig.homeSlug}`}
            className={cn("text-lg font-semibold tracking-tight", inlineMdx)}
          >
            {title}
          </Link>
          <div className="layout-slot min-w-0 flex-1">
            {topMenu}
          </div>
          <div
            className={cn(
              "layout-slot flex flex-wrap items-center gap-x-2",
              "text-sm text-muted-foreground",
              inlineMdx
            )}
          >
            {topQuickAccess}
          </div>
          <AccountMenu identity={identity} />
        </div>
      </div>

      {!isBlankMdx(slots.header) && (
        <div className="border-b bg-muted/40">
          <div className={cn("mx-auto max-w-5xl px-4 py-3 text-sm", inlineMdx)}>
            {header}
          </div>
        </div>
      )}

      {/* A flex column so a page can stretch to the viewport (the show
          page's double-click-to-edit surface covers the blank area). */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
        {children}
      </main>

      <footer className="border-t">
        <div
          className={cn(
            "mx-auto max-w-5xl px-4 py-4 text-sm text-muted-foreground",
            inlineMdx
          )}
        >
          {footer}
        </div>
      </footer>
    </>
  );
}
