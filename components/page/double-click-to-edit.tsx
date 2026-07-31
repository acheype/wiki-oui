"use client";

import { useRouter } from "next/navigation";

// YesWiki reflex (ADR 0005): double-clicking the rendered page body opens
// the editor. Interactive elements keep their own double-click behavior.
// The caller stretches the surface (className) so short content — a small
// entry — still catches double-clicks in the blank area below it.
//
// Without the write right it does nothing at all, silently
// (docs/permissions.md): the gesture is a shortcut nobody was told about, so
// a refusal would answer a question that was never asked.
export function DoubleClickToEdit({
  slug,
  enabled,
  className,
  children,
}: {
  slug: string;
  enabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div
      className={className}
      onDoubleClick={(event) => {
        if (!enabled) return;
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
