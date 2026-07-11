import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WikiOui",
};

// Bare skeleton shared by every page; the site chrome (top bar, footer)
// lives in the (site) route group so /api pages stay chrome-free.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
