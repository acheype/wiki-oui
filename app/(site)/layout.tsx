import { AccountMenu } from "@/modules/accounts/ui/account-menu";
import { getLayoutContents } from "@/modules/pages/content";
import { TitleSlot, renderSlot } from "@/modules/pages/ui/layout-slot";
import { StickyTopBar } from "@/modules/pages/ui/sticky-top-bar";
import { currentIdentity, isCurrentAdmin } from "@/modules/permissions/person";
import { cn } from "@/lib/utils";

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
  // Only an administrator is told about a layout page that does not exist —
  // see modules/pages/ui/layout-slot.tsx for why nobody else is.
  const isAdmin = await isCurrentAdmin();
  // The four remaining slot renders are independent: pipeline them. Each
  // comes back null when it has nothing to say, and the layout then leaves it
  // out. The title renders itself, being the one slot that is also a link.
  const [topMenu, topQuickAccess, header, footer] = await Promise.all([
    renderSlot(slots.topMenu, isAdmin),
    renderSlot(slots.topQuickAccess, isAdmin),
    renderSlot(slots.header, isAdmin),
    renderSlot(slots.footer, isAdmin),
  ]);

  return (
    <>
      <StickyTopBar>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <TitleSlot
            slot={slots.title}
            isAdmin={isAdmin}
            className={cn("text-lg font-semibold tracking-tight", inlineMdx)}
          />
          {/* Always rendered, empty menu or not: this is the bar's flexible
              middle, and what keeps the account menu on the right edge. The
              only slot whose box outlives its content, for that reason. */}
          <div className="layout-slot min-w-0 flex-1">{topMenu}</div>
          {topQuickAccess && (
            <div
              className={cn(
                "layout-slot flex flex-wrap items-center gap-x-2",
                "text-sm text-muted-foreground",
                inlineMdx
              )}
            >
              {topQuickAccess}
            </div>
          )}
          <AccountMenu identity={identity} />
        </div>
      </StickyTopBar>

      {header && (
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

      {footer && (
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
      )}
    </>
  );
}
