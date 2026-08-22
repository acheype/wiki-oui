"use client";

// PagesAdmin (docs/permissions.md § gerer-pages): the state of the rights of
// the whole wiki on one system page, and a decision applied to dozens of pages at
// once without wondering what has just been broken.
//
// The list is the whole of it — searching, the two filters and the selection
// all work on what has arrived, so the counts and the lot are always talking
// about the same pages. The `⌗Formulaire` marker tells a fiche from a page
// without a column of its own.

import { Globe, Hash, Lock, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PagesAdminData,
  loadManagedPages,
} from "@/modules/pages/admin-actions";
import { BulkOwnerDialog } from "@/modules/pages/ui/bulk-owner-dialog";
import { BulkRightsDialog } from "@/modules/pages/ui/bulk-rights-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SELECT_NONE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDirectKeyboard } from "@/components/ui/use-direct-keyboard";
import { plural } from "@/lib/format";
import {
  type Criteria,
  type KindFilter,
  EVERYTHING,
  KINDS,
  coherent,
  formsOf,
  pagesMatching,
} from "@/modules/pages/filters/filters";
// hasForm from modules/pages/entry-page.ts, not modules/pages/content.ts:
// this is a Client Component, and modules/pages/content.ts carries
// server-only imports (ADR 0025) a client bundle cannot take on, even for a
// function that never touches them.
import { hasForm } from "@/modules/pages/entry-page";
import type { ManagedPage } from "@/modules/pages/rights";
import {
  type AccessRule,
  type AclDirectory,
  pageRule,
  ruleSummary,
} from "@/modules/permissions/rules";
import { ANONYMOUS } from "@/modules/accounts/username";

/** « Tous » in the formulaire filter: Radix refuses an item with no value. */
const EVERY_FORM = SELECT_NONE;

export function PagesAdmin() {
  const [data, setData] = useState<PagesAdminData | null>(null);
  const [criteria, setCriteria] = useState<Criteria>(EVERYTHING);
  const [selection, setSelection] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    loadManagedPages().then(setData);
  }, []);

  useEffect(() => reload(), [reload]);

  // One list on this page, so it takes the direct keyboard as the formulaires
  // and the comptes do — the space bar excepted, which belongs to the ticks.
  useDirectKeyboard(searchRef);

  if (!data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const pages = data.pages;
  const visible = pagesMatching(pages, criteria);
  const forms = formsOf(pages);
  const selected = visible.filter((page) => selection.includes(page.slug));
  const allShown = visible.length > 0 && selected.length === visible.length;

  /**
   * The selection narrows with the list: a tick one can no longer see is a
   * decision one can no longer take back, and acting on a page one has
   * filtered out is the surprise this system page exists to avoid.
   */
  function narrow(next: Partial<Criteria>) {
    const narrowed = coherent(criteria, next);
    setCriteria(narrowed);
    const shown = new Set(pagesMatching(pages, narrowed).map((page) => page.slug));
    setSelection((current) => current.filter((slug) => shown.has(slug)));
  }

  function toggle(slug: string, checked: boolean) {
    setSelection((current) =>
      checked ? [...current, slug] : current.filter((one) => one !== slug)
    );
  }

  /** The list is stale the moment a lot has been written, and so is the tick. */
  function afterLot() {
    setSelection([]);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="flex-1 text-lg font-semibold">Pages et fiches</h2>
        <p className="text-sm text-muted-foreground">
          {visible.length === pages.length
            ? plural(pages.length, "page", "pages")
            : `${visible.length} sur ${plural(pages.length, "page", "pages")}`}
        </p>
      </div>

      <div className="grid gap-3 rounded-md border p-3">
        <Input
          ref={searchRef}
          value={criteria.needle}
          placeholder="Tapez pour rechercher par nom…"
          onChange={(event) => narrow({ needle: event.target.value })}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-sm font-medium">Type</span>
          <RadioGroup
            value={criteria.kind}
            onValueChange={(value) => narrow({ kind: value as KindFilter })}
            className="flex flex-wrap gap-x-5 gap-y-2"
          >
            {KINDS.map((choice) => (
              <div key={choice.value} className="flex items-center gap-2">
                <RadioGroupItem value={choice.value} id={`type-${choice.value}`} />
                <Label
                  htmlFor={`type-${choice.value}`}
                  className="text-sm font-normal"
                >
                  {choice.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="form-filter" className="text-sm font-medium">
            Formulaire
          </Label>
          <Select
            value={criteria.formSlug ?? EVERY_FORM}
            onValueChange={(value) =>
              narrow({ formSlug: value === EVERY_FORM ? null : value })
            }
          >
            <SelectTrigger id="form-filter" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERY_FORM}>Tous</SelectItem>
              {forms.map((form) => (
                <SelectItem key={form.slug} value={form.slug}>
                  {form.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {pages.length === 0
            ? "Aucune page pour l'instant."
            : "Aucune page ne correspond aux filtres."}
        </p>
      ) : (
        <div className="grid gap-1">
          <div className="flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={allShown}
              aria-label="Tout sélectionner"
              onCheckedChange={(checked) =>
                setSelection(checked ? visible.map((page) => page.slug) : [])
              }
            />
            <span className="min-w-0 flex-1">Page</span>
            <span className="hidden w-40 sm:block">Propriétaire</span>
            <span className="hidden w-32 sm:block">Voir</span>
            <span className="hidden w-32 sm:block">Modifier</span>
          </div>

          <ul className="grid gap-1">
            {visible.map((page) => (
              <li
                key={page.slug}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
              >
                <Checkbox
                  checked={selection.includes(page.slug)}
                  aria-label={`Sélectionner ${page.slug}`}
                  onCheckedChange={(checked) => toggle(page.slug, checked === true)}
                />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Link
                    href={`/${page.slug}`}
                    className="truncate font-medium hover:underline"
                  >
                    {page.slug}
                  </Link>
                  {hasForm(page) && (
                    <Link
                      href={`/fiches?formulaire=${page.form.slug}`}
                      title={`Fiche du formulaire ${page.form.name}`}
                      className="flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Hash className="size-3" aria-hidden />
                      {page.form.name}
                    </Link>
                  )}
                </span>
                <span className="w-40 truncate text-sm text-muted-foreground">
                  {page.owner?.name ?? ANONYMOUS}
                </span>
                <RightCell rule={pageRule(page, "READ")} page={page} directory={data.directory} />
                <RightCell rule={pageRule(page, "WRITE")} page={page} directory={data.directory} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-3 rounded-md border bg-background px-3 py-2 shadow-sm">
          <span className="flex-1 text-sm">
            {plural(selected.length, "page sélectionnée", "pages sélectionnées")}
          </span>
          <BulkRightsDialog
            pages={selected}
            directory={data.directory}
            onApplied={afterLot}
          />
          <BulkOwnerDialog
            pages={selected}
            people={data.directory.people}
            onApplied={afterLot}
          />
        </div>
      )}
    </div>
  );
}

/** The icon each scope wears, so a column is read without being read. */
const SCOPE_ICONS = {
  everyone: Globe,
  authenticated: UsersRound,
  restricted: Lock,
} as const;

function RightCell({
  rule,
  page,
  directory,
}: {
  rule: AccessRule;
  page: ManagedPage;
  directory: AclDirectory;
}) {
  const Icon = SCOPE_ICONS[rule.scope];
  return (
    <span className="flex w-32 min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {ruleSummary(rule, { owner: page.owner }, directory)}
      </span>
    </span>
  );
}
