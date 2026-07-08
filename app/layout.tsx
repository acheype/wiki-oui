import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { isBlankMdx, renderMdx } from "@/lib/mdx";
import { getLayoutContents } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { wikiConfig } from "@/wiki.config";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WikiOui",
};

// Inline the paragraphs MDX produces: layout slots hold fragments, not prose.
const inlineMdx = "[&_p]:m-0 [&_p]:inline";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const slots = await getLayoutContents();

  return (
    <html
      lang="fr"
      className={cn(
        "h-full antialiased font-sans",
        inter.variable,
        geistMono.variable
      )}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
            <Link
              href={`/${wikiConfig.homeSlug}`}
              className={cn("text-lg font-semibold tracking-tight", inlineMdx)}
            >
              {await renderMdx(slots.titre)}
            </Link>
            <div className="min-w-0 flex-1">{await renderMdx(slots.menuHaut)}</div>
            <div className={cn("text-sm text-muted-foreground", inlineMdx)}>
              {await renderMdx(slots.rapideHaut)}
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
        <Toaster richColors />
      </body>
    </html>
  );
}
