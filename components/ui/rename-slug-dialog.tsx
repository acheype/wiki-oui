"use client";

import { TriangleAlert } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SlugInput } from "@/components/ui/slug-input";
import { isValidSlug } from "@/lib/slug";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";

// The confirmation dialog of a rename, shared by « Changer l'adresse »
// (pages) and « Changer l'identifiant » (forms — ADR 0016 — and fields —
// ADR 0017, where `rename` merely stages the change locally): informed
// consent — the live headcount of what references the identifier, the
// optional warning to accept knowingly — and a confirm button that names
// the action.
export function RenameSlugDialog({
  trigger,
  title,
  currentLabel,
  current,
  inputLabel,
  confirmLabel,
  searchingText,
  impactSentence,
  warning,
  note,
  fetchImpact,
  rename,
  onRenamed,
}: {
  /** The action-bar button; wrapped in DialogTrigger asChild. */
  trigger: React.ReactNode;
  title: string;
  /** e.g. « Adresse actuelle » / « Identifiant actuel ». */
  currentLabel: string;
  current: string;
  inputLabel: string;
  confirmLabel: string;
  /** Shown while fetchImpact is in flight. */
  searchingText: string;
  impactSentence: (impact: SlugReferenceImpact) => string;
  /** Consequence to accept knowingly; omitted when the rename has none. */
  warning?: React.ReactNode;
  /** Plain remark (no alert styling), e.g. when the rename applies later. */
  note?: React.ReactNode;
  fetchImpact: () => Promise<SlugReferenceImpact>;
  rename: (
    newSlug: string
  ) => Promise<{ error?: string } | { ok: true } | void>;
  /** Called after a successful rename; absent when the action navigates itself. */
  onRenamed?: (newSlug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [impact, setImpact] = useState<SlugReferenceImpact>();
  const [isPending, startTransition] = useTransition();
  const formId = useId();
  const inputId = useId();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      // Prefilled with the current identifier (selected on focus): confirm
      // stays disabled until the value actually moves.
      setNewSlug(current);
      setImpact(undefined);
      fetchImpact().then(setImpact);
    }
  }

  const ready = isValidSlug(newSlug) && newSlug !== current;

  function confirm() {
    startTransition(async () => {
      const result = await rename(newSlug);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      onRenamed?.(newSlug);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {currentLabel} : <span className="font-mono">{current}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !isPending) confirm();
          }}
        >
          <Label htmlFor={inputId} className="mb-2 gap-1">
            {inputLabel}
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <SlugInput
            id={inputId}
            value={newSlug}
            autoFocus
            placeholder={current}
            onFocus={(event) => event.target.select()}
            onValueChange={setNewSlug}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Minuscules, chiffres et tirets uniquement.
          </p>
        </form>
        <p className="text-sm">
          {impact ? impactSentence(impact) : searchingText}
        </p>
        {warning !== undefined && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{warning}</span>
          </p>
        )}
        {note !== undefined && (
          <p className="text-sm text-muted-foreground">{note}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={!ready || isPending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « X pages, Y fiches et Z formulaires » — the enumerated headcount, with
 * French agreement, ready to precede its verb. Null when nothing references.
 */
export function impactParts(impact: SlugReferenceImpact): string | null {
  const parts = [
    countNoun(impact.pages, "page"),
    countNoun(impact.entries, "fiche"),
    countNoun(impact.forms, "formulaire"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return new Intl.ListFormat("fr").format(parts);
}

export function impactTotal(impact: SlugReferenceImpact): number {
  return impact.pages + impact.entries + impact.forms;
}

function countNoun(total: number, noun: string): string | null {
  if (total === 0) return null;
  return `${total} ${noun}${total > 1 ? "s" : ""}`;
}
