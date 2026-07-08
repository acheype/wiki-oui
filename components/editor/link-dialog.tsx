"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { LinkTarget } from "./commands";

const isExternal = (href: string) => /^https?:\/\//.test(href);

// Link modal (ADR 0006): internal links are slug-relative, externals start
// with http(s)://; the target can be the current tab, a new tab or a Dialog.
// In "edit" mode (cursor-anchored link icon, ADR 0005) it rewrites an
// existing link instead of inserting one.
export function LinkDialog({
  open,
  onOpenChange,
  mode = "insert",
  initialText,
  initialHref = "",
  initialTarget = "self",
  allSlugs,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "insert" | "edit";
  initialText: string;
  initialHref?: string;
  initialTarget?: LinkTarget;
  allSlugs: string[];
  onInsert: (link: { text: string; href: string; target: LinkTarget }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Modifier le lien" : "Insérer un lien"}
          </DialogTitle>
        </DialogHeader>
        {/* Keyed on open so every opening starts from a fresh form. */}
        <LinkForm
          key={String(open)}
          mode={mode}
          initialText={initialText}
          initialHref={initialHref}
          initialTarget={initialTarget}
          allSlugs={allSlugs}
          onCancel={() => onOpenChange(false)}
          onInsert={(link) => {
            onInsert(link);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  mode,
  initialText,
  initialHref,
  initialTarget,
  allSlugs,
  onCancel,
  onInsert,
}: {
  mode: "insert" | "edit";
  initialText: string;
  initialHref: string;
  initialTarget: LinkTarget;
  allSlugs: string[];
  onCancel: () => void;
  onInsert: (link: { text: string; href: string; target: LinkTarget }) => void;
}) {
  const [text, setText] = useState(initialText);
  const [href, setHref] = useState(initialHref);
  const [target, setTarget] = useState<LinkTarget>(initialTarget);

  const suggestions = useMemo(() => {
    const query = href.trim().toLowerCase();
    if (query === "" || isExternal(query)) return [];
    return allSlugs
      .filter((slug) => slug.includes(query) && slug !== query)
      .slice(0, 6);
  }, [href, allSlugs]);

  const canInsert = href.trim() !== "";

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canInsert) return;
        const cleanHref = href.trim();
        onInsert({ text: text.trim() || cleanHref, href: cleanHref, target });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="link-text">Texte affiché</Label>
        <Input
          id="link-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Texte du lien"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="link-href">Page du wiki ou URL externe</Label>
        <Input
          id="link-href"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="ma-page ou https://…"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((slug) => (
              <Button
                key={slug}
                type="button"
                variant="secondary"
                size="sm"
                className="h-6 rounded-full px-2 font-mono text-xs"
                onClick={() => setHref(slug)}
              >
                {slug}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label>Ouvrir dans</Label>
        <RadioGroup
          value={target}
          onValueChange={(value) => setTarget(value as LinkTarget)}
          className="gap-1.5"
        >
          <Label className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="self" /> L&apos;onglet courant
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="_blank" /> Un nouvel onglet
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="modal" /> Une fenêtre modale
          </Label>
        </RadioGroup>
        {target === "modal" && isExternal(href) && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Beaucoup de sites externes refusent d&apos;être affichés dans une
            fenêtre modale ; le contenu risque de rester vide.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!canInsert}>
          {mode === "edit" ? "Modifier" : "Insérer le lien"}
        </Button>
      </DialogFooter>
    </form>
  );
}
