"use client";

import { useRouter } from "next/navigation";

// YesWiki reflex (ADR 0005): double-clicking the rendered page body opens
// the editor. Interactive elements keep their own double-click behavior.
export function DoubleClickToEdit({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, textarea, select, iframe, [role='dialog']")) {
          return;
        }
        router.push(`/${slug}/edit`);
      }}
    >
      {children}
    </div>
  );
}
