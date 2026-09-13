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
import { useMemo, useState, type RefObject } from "react";
import { emitsMarkdownLink } from "@/modules/authoring/descriptor";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SwipeRow } from "./swipe-row";
import { InlinePageBody, usePageBody } from "@/modules/pages/page-modal";
import { cn } from "@/lib/utils";
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
      <TooltipTrigger
        render={
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
          />
        }
      >
        {children}
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
  const [helpOpen, setHelpOpen] = useState(false);

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
    <TooltipProvider delay={400}>
      {/* One row, whatever the width: a second row of tools would eat the
          text it serves. Narrower than its tools, it scrolls sideways and
          says so, under an indicator of our own (SwipeRow). Takes the bar's
          width first (flex-1), the actions keeping theirs; on a phone it
          takes the whole row and they drop below it. */}
      <SwipeRow className="min-w-0 flex-1 max-sm:basis-full">
        <ToolButton label="Gras (Ctrl+B)" viewRef={viewRef} command={(v) => toggleInline(v, "**")}>
          {/* A heavier stroke than the rest of the row: the icon is a B, and
              a B drawn as thin as the others says nothing about bold. */}
          <Bold strokeWidth={4} />
        </ToolButton>
        <ToolButton label="Italique (Ctrl+I)" viewRef={viewRef} command={(v) => toggleInline(v, "*")}>
          <Italic />
        </ToolButton>
        <ToolButton label="Barré" viewRef={viewRef} command={(v) => toggleInline(v, "~~")}>
          <Strikethrough />
        </ToolButton>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onMouseDown={(event) => event.preventDefault()}
                      aria-label="Titre"
                    />
                  }
                />
              }
            >
              <Heading />
            </TooltipTrigger>
            <TooltipContent>Titre</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            {[1, 2, 3, 4].map((level) => (
              <DropdownMenuItem
                key={level}
                onClick={() => {
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
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onMouseDown={(event) => event.preventDefault()}
                      aria-label="Alignement"
                    />
                  }
                />
              }
            >
              <AlignCenter />
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
                onClick={() => {
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
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRequestUpload}
                aria-label="Uploader un fichier"
              />
            }
          >
            <Upload />
          </TooltipTrigger>
          <TooltipContent>Uploader un fichier</TooltipContent>
        </Tooltip>

        {menuBuilders.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onMouseDown={(event) => event.preventDefault()}
                        aria-label="Composants"
                      />
                    }
                  />
                }
              >
                <Puzzle />
              </TooltipTrigger>
              <TooltipContent>Composants</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {menuBuilders.map((builder) => (
                <DropdownMenuItem
                  key={builder.name}
                  onClick={() => onRequestComponent(builder)}
                >
                  {builder.descriptor.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Only when the row is full does the help button sit against the
            tools; a rule then tells the two apart. With room to spare it
            floats off to the right, and needs none. */}
        <Separator
          orientation="vertical"
          className="mx-1 hidden h-5! group-data-[overflowing]/swipe:block"
        />
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setHelpOpen(true)}
                  aria-label="Aide-mémoire"
                />
              }
            >
              <CircleQuestionMark />
            </TooltipTrigger>
            <TooltipContent>Aide-mémoire</TooltipContent>
          </Tooltip>
        </div>
      </SwipeRow>

      {/* Read over the text being written, not in another tab: the cheat
          sheet answers a question asked mid-sentence. Rendered inline (ADR
          0022), deliberately without ?modale=: the editor has no unsaved-work
          guard, so a history entry would teach that Back is harmless — when a
          Back too far leaves the editor and loses the draft in silence. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto sm:max-w-5xl">
          {helpOpen && <CheatSheet />}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// The cheat sheet's own page, shown in place: the dialog wears the title the
// inline render dropped (readPageBody resolves it), so it is written once. A
// page opening with no heading hands nothing over, and the fallback only
// names the dialog for a screen reader (a dialog needs a name). The two
// usePageBody reads — here and inside <InlinePageBody> — share one cached
// fetch.
function CheatSheet() {
  const loaded = usePageBody("aide-memoire");
  return (
    <>
      <DialogHeader>
        <DialogTitle className={cn(!loaded?.title && "sr-only")}>
          {loaded?.title ?? "Aide-mémoire"}
        </DialogTitle>
      </DialogHeader>
      <InlinePageBody slug="aide-memoire" />
    </>
  );
}
