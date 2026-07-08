"use client";

import type { EditorView } from "@codemirror/view";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CircleQuestionMark,
  Code,
  Columns3,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  MessageSquareOff,
  Minus,
  Quote,
  Rows3,
  Strikethrough,
  Table,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addTableColumn,
  addTableRow,
  deleteTableRow,
  insertHorizontalRule,
  insertLink,
  insertTable,
  setAlignment,
  setHeading,
  toggleCode,
  toggleComment,
  toggleInline,
  toggleList,
  toggleQuote,
} from "./commands";
import { LinkDialog } from "./link-dialog";

type ViewRef = RefObject<EditorView | null>;
type EditorCommand = (view: EditorView) => void;

function ToolButton({
  label,
  viewRef,
  command,
  children,
}: {
  label: string;
  viewRef: ViewRef;
  command: EditorCommand;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // Keep the editor selection: the button must not steal focus.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (viewRef.current) command(viewRef.current);
          }}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar({
  viewRef,
  allSlugs,
  inTable,
}: {
  viewRef: ViewRef;
  allSlugs: string[];
  inTable: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectionText, setSelectionText] = useState("");

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/40 px-1.5 py-1">
        <ToolButton label="Gras (Ctrl+B)" viewRef={viewRef} command={(v) => toggleInline(v, "**")}>
          <Bold />
        </ToolButton>
        <ToolButton label="Italique (Ctrl+I)" viewRef={viewRef} command={(v) => toggleInline(v, "*")}>
          <Italic />
        </ToolButton>
        <ToolButton label="Barré" viewRef={viewRef} command={(v) => toggleInline(v, "~~")}>
          <Strikethrough />
        </ToolButton>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  aria-label="Titre"
                >
                  <Heading />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Titre</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            {[1, 2, 3, 4].map((level) => (
              <DropdownMenuItem
                key={level}
                onSelect={() => {
                  if (viewRef.current) setHeading(viewRef.current, level);
                }}
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: `${1.15 - level * 0.08}rem` }}
                >
                  Titre {level}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5!" />

        <ToolButton label="Liste à puces" viewRef={viewRef} command={(v) => toggleList(v, "bullet")}>
          <List />
        </ToolButton>
        <ToolButton label="Liste numérotée" viewRef={viewRef} command={(v) => toggleList(v, "ordered")}>
          <ListOrdered />
        </ToolButton>
        <ToolButton label="Liste de tâches" viewRef={viewRef} command={(v) => toggleList(v, "task")}>
          <ListTodo />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5!" />

        <ToolButton label="Citation" viewRef={viewRef} command={toggleQuote}>
          <Quote />
        </ToolButton>
        <ToolButton label="Code" viewRef={viewRef} command={toggleCode}>
          <Code />
        </ToolButton>
        <ToolButton label="Ligne horizontale" viewRef={viewRef} command={insertHorizontalRule}>
          <Minus />
        </ToolButton>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  aria-label="Alignement"
                >
                  <AlignCenter />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Alignement</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            {(
              [
                ["left", "Aligner à gauche", AlignLeft],
                ["center", "Centrer", AlignCenter],
                ["right", "Aligner à droite", AlignRight],
              ] as const
            ).map(([alignment, label, Icon]) => (
              <DropdownMenuItem
                key={alignment}
                onSelect={() => {
                  if (viewRef.current) setAlignment(viewRef.current, alignment);
                }}
              >
                <Icon /> {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolButton
          label="Commentaire (invisible à l'affichage)"
          viewRef={viewRef}
          command={toggleComment}
        >
          <MessageSquareOff />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5!" />

        <ToolButton
          label="Lien"
          viewRef={viewRef}
          command={(view) => {
            const range = view.state.selection.main;
            setSelectionText(view.state.sliceDoc(range.from, range.to));
            setLinkOpen(true);
          }}
        >
          <Link2 />
        </ToolButton>

        <ToolButton label="Tableau" viewRef={viewRef} command={insertTable}>
          <Table />
        </ToolButton>
        {inTable && (
          <>
            <ToolButton label="Ajouter une ligne" viewRef={viewRef} command={addTableRow}>
              <Rows3 />
            </ToolButton>
            <ToolButton label="Ajouter une colonne" viewRef={viewRef} command={addTableColumn}>
              <Columns3 />
            </ToolButton>
            <ToolButton label="Supprimer la ligne" viewRef={viewRef} command={deleteTableRow}>
              <Trash2 />
            </ToolButton>
          </>
        )}

        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild type="button" variant="ghost" size="icon-sm" aria-label="Aide-mémoire">
                <Link href="/aide-memoire" target="_blank">
                  <CircleQuestionMark />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Aide-mémoire (nouvel onglet)</TooltipContent>
          </Tooltip>
        </div>

        <LinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          initialText={selectionText}
          allSlugs={allSlugs}
          onInsert={(link) => {
            if (viewRef.current) insertLink(viewRef.current, link);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
