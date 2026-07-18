"use client";

import { useRouter } from "next/navigation";

// YesWiki reflex (ADR 0005): double-clicking the rendered page body opens
// the editor. Interactive elements keep their own double-click behavior.
// The caller stretches the surface (className) so short content — a small
// entry — still catches double-clicks in the blank area below it.
export function DoubleClickToEdit({
  slug,
  className,
  children,
}: {
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div
      className={className}
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
