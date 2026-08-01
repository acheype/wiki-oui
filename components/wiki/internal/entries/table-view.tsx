"use client";

// Tableau (docs/entries-view.md): explicit columns (or every field when the
// prop is empty), sortable headers, labels always shown (never keys), images
// always as thumbnails, clickable rows (entryDisplay), a per-option split of
// multiChoice fields, sum totals on number columns, and an optional
// Modifier / Supprimer column. Pagination comes from the common chrome.

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deletePage } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { entryValue } from "@/lib/entries-view";
import type { ViewEntry } from "@/lib/entries-view";
import { imageUrl } from "@/lib/image-url";
import { SAMPLE_IMAGE } from "@/lib/sample-entries";
import { cn } from "@/lib/utils";
import type { ViewContext } from "./types";

interface TableColumn {
  /** The sorted/read field; split columns read one option of it. */
  field: string;
  header: string;
  /** Set on a splitMultiChoice column: the option this column checks. */
  option?: string;
}

export function TableView({ context }: { context: ViewContext }) {
  const { entries, data, props } = context;

  const declared =
    (props.columns ?? []).length > 0
      ? (props.columns ?? []).map((column) => ({
          field: column.field,
          header: column.title ?? context.labelOf(column.field),
        }))
      : data.fields.map((field) => ({ field: field.name, header: field.label }));

  // splitMultiChoice: a multiChoice column becomes one ✓ column per option.
  const columns: TableColumn[] = declared.flatMap((column) => {
    const meta = data.fields.find((field) => field.name === column.field);
    if (props.splitMultiChoice === true && meta?.type === "multiChoice") {
      return Object.entries(meta.options ?? {}).map(([option, label]) => ({
        field: column.field,
        header: label,
        option,
      }));
    }
    return [column];
  });

  const sums = toNames(props.sumFields);
  const hasSums = sums.length > 0;
  const sumOf = (field: string) =>
    entries.reduce((total, entry) => {
      const value = entryValue(entry, field);
      return typeof value === "number" ? total + value : total;
    }, 0);

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            {columns.map((column, index) => (
              <HeaderCell key={index} column={column} context={context} />
            ))}
            {props.actionsColumn === true && <th className="w-24" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <Row
              key={entry.slug}
              entry={entry}
              columns={columns}
              context={context}
            />
          ))}
        </tbody>
        {hasSums && (
          <tfoot>
            <tr className="border-t bg-muted/40 font-medium">
              {columns.map((column, index) => (
                <td key={index} className="px-3 py-2">
                  {sums.includes(column.field) && column.option === undefined
                    ? formatNumber(sumOf(column.field))
                    : index === 0 && !sums.includes(columns[0].field)
                      ? "Total"
                      : ""}
                </td>
              ))}
              {props.actionsColumn === true && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function HeaderCell({
  column,
  context,
}: {
  column: TableColumn;
  context: ViewContext;
}) {
  const { sort, onSort } = context;
  // A split column sorts on its parent field: good enough, and honest.
  const sorted = sort?.field === column.field;
  return (
    <th className="px-3 py-2 font-medium">
      {onSort ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => onSort(column.field)}
        >
          {column.header}
          <span
            className={cn("text-xs", !sorted && "invisible")}
            aria-hidden
          >
            {sort?.order === "asc" ? "↑" : "↓"}
          </span>
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

function Row({
  entry,
  columns,
  context,
}: {
  entry: ViewEntry;
  columns: TableColumn[];
  context: ViewContext;
}) {
  const color = context.colorOf(entry);
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-accent/50"
      style={color ? { boxShadow: `inset 3px 0 0 0 ${color}` } : undefined}
      onClick={() => context.openEntry(entry.slug)}
    >
      {columns.map((column, index) => (
        <td key={index} className="px-3 py-2">
          <CellValue entry={entry} column={column} context={context} />
        </td>
      ))}
      {context.props.actionsColumn === true && (
        <ActionsCell entry={entry} sample={context.data.sample} />
      )}
    </tr>
  );
}

function CellValue({
  entry,
  column,
  context,
}: {
  entry: ViewEntry;
  column: TableColumn;
  context: ViewContext;
}) {
  if (column.option !== undefined) {
    const value = entryValue(entry, column.field);
    const checked = Array.isArray(value) && value.includes(column.option);
    return checked ? <span aria-label="oui">✓</span> : null;
  }
  const meta = context.data.fields.find(
    (field) => field.name === column.field
  );
  if (meta?.type === "image") {
    const value = entryValue(entry, column.field);
    if (typeof value !== "string" || value === "") return null;
    if (value === SAMPLE_IMAGE) {
      return <span className="block size-10 rounded bg-muted" aria-hidden />;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element -- files-API thumbnail
      <img
        src={imageUrl(value, { width: 80, height: 80 })}
        alt=""
        className="size-10 rounded object-cover"
        loading="lazy"
      />
    );
  }
  return <>{context.textOf(entry, column.field)}</>;
}

function ActionsCell({ entry, sample }: { entry: ViewEntry; sample: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  if (deleted) return <td />;
  return (
    <td className="px-2 py-1.5 text-right whitespace-nowrap">
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Modifier la fiche"
        onClick={(event) => event.stopPropagation()}
      >
        <a href={sample ? undefined : `/${entry.slug}/edit`}>
          <Pencil className="size-3.5" />
        </a>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-destructive"
        aria-label="Supprimer la fiche"
        onClick={(event) => {
          event.stopPropagation();
          if (!sample) setConfirming(true);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette fiche ?</AlertDialogTitle>
            <AlertDialogDescription>
              «&nbsp;{entry.title}&nbsp;» et son historique seront supprimés
              définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              // Deleting stops at the owner and the administrators
              // (docs/permissions.md): a row that vanished on a refusal would
              // report a deletion the wiki did not make.
              onClick={async () => {
                const result = await deletePage(entry.slug);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                setDeleted(true);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </td>
  );
}

function toNames(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return value !== "" ? [value] : [];
  return value ?? [];
}

function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}
