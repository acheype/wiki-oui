"use client";

import { createContext, useContext } from "react";

const QuickAccessMenuContext = createContext(false);

// Marks the authored menu that occupies the top bar's quick-access slot. The
// menu keeps owning its configurable links, while fixed browser preferences
// can be added without rewriting an existing wiki's edited layout page.
export function QuickAccessSlot({ children }: { children: React.ReactNode }) {
  return (
    <QuickAccessMenuContext.Provider value>
      {children}
    </QuickAccessMenuContext.Provider>
  );
}

export function useQuickAccessMenu(): boolean {
  return useContext(QuickAccessMenuContext);
}
