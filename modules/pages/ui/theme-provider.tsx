"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Theme ownership stays in the site chrome: page content only consumes the
// resulting shadcn tokens. Light remains the initial WikiOui appearance until
// a visitor explicitly chooses dark mode, and next-themes restores that choice
// before the page paints on subsequent visits.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="wikioui-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
