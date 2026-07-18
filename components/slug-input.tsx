"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeSlugInput } from "@/lib/slug";
import { cn } from "@/lib/utils";

/**
 * The slug entry field, shared by every identifier input (form and field
 * identifiers, entry address, rename dialogs): monospace, and typing is
 * normalized live — forbidden characters cannot be entered, separators
 * become dashes (lib/slug normalizeSlugInput).
 */
export function SlugInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      className={cn("font-mono text-sm", className)}
      onChange={(event) => onValueChange(normalizeSlugInput(event.target.value))}
      {...props}
    />
  );
}

/**
 * A not-yet-persisted identifier, inline-editable (click-to-edit): at rest a
 * chip with a pencil affordance, one click away from a SlugInput in the same
 * spot (value selected, Enter or blur closes). The caller owns the derive
 * rule — its onBlur re-derives a value left empty.
 */
export function SlugInlineEdit({
  id,
  value,
  editLabel,
  className,
  onValueChange,
  onBlur,
}: {
  id?: string;
  value: string;
  /** Accessible name of the chip button, e.g. « Personnaliser l'identifiant ». */
  editLabel: string;
  /** Applied to the input while editing (width, height…). */
  className?: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        id={id}
        title={editLabel}
        aria-label={`${editLabel} : ${value}`}
        onClick={() => setEditing(true)}
        className="group flex w-fit cursor-pointer items-center gap-1.5"
      >
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm transition-colors group-hover:bg-accent">
          {value || "…"}
        </code>
        <Pencil
          className="size-3.5 text-muted-foreground group-hover:text-foreground"
          aria-hidden
        />
      </button>
    );
  }
  return (
    <SlugInput
      id={id}
      value={value}
      autoFocus
      className={className}
      onFocus={(event) => event.target.select()}
      onValueChange={onValueChange}
      onBlur={() => {
        setEditing(false);
        onBlur?.();
      }}
      onKeyDown={(event) => {
        // Enter closes the inline edit instead of submitting the host form.
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
