"use client";

import type { EditorView } from "@codemirror/view";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CircleQuestionMark,
  Code,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  MessageSquareOff,
  Minus,
  Puzzle,
  Quote,
  Strikethrough,
  Table,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type RefObject } from "react";
import { emitsMarkdownLink } from "@/modules/authoring/descriptor";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
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
  insertHorizontalRule,
  insertTable,
  setAlignment,
  setHeading,
  toggleCode,
  toggleComment,
  toggleInline,
  toggleList,
  toggleQuote,
} from "./commands";

type ViewRef = RefObject<EditorView | null>;

const labelCollator = new Intl.Collator("fr");
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
  onRequestLink,
  builders,
  onRequestComponent,
  onRequestUpload,
}: {
  viewRef: ViewRef;
  /** Opens the link dialog in insert mode with the current selection text. */
  onRequestLink: (selectionText: string) => void;
  builders: ComponentBuilderSpec[];
  /** Opens the ComponentBuilder in insert mode. */
  onRequestComponent: (spec: ComponentBuilderSpec) => void;
  /** Opens the file picker of the upload pipeline (ADR 0012). */
  onRequestUpload: () => void;
}) {
  // Alphabetical labels; markdown-link emitters (wiki-link) have their own
  // doors and stay out of the menu (docs/component-builder.md).
  const menuBuilders = useMemo(
    () =>
      builders
        .filter((builder) => !emitsMarkdownLink(builder.descriptor))
        .sort((a, b) =>
          labelCollator.compare(a.descriptor.label, b.descriptor.label)
        ),
    [builders]
  );

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
            onRequestLink(view.state.sliceDoc(range.from, range.to));
          }}
        >
          <Link2 />
        </ToolButton>

        <ToolButton label="Insérer un tableau" viewRef={viewRef} command={insertTable}>
          <Table />
        </ToolButton>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onRequestUpload}
              aria-label="Uploader un fichier"
            >
              <Upload />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Uploader un fichier</TooltipContent>
        </Tooltip>

        {menuBuilders.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onMouseDown={(event) => event.preventDefault()}
                    aria-label="Composants"
                  >
                    <Puzzle />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Composants</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {menuBuilders.map((builder) => (
                <DropdownMenuItem
                  key={builder.name}
                  onSelect={() => onRequestComponent(builder)}
                >
                  {builder.descriptor.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
      </div>
    </TooltipProvider>
  );
}
