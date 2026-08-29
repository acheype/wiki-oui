"use client";

import type { EditorView } from "@codemirror/view";
import { Loader2, Save, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { discardUploadedFile, lintPage, savePage } from "@/modules/pages/content-actions";
import type { PageWarning } from "@/modules/pages/lint";
import { Button } from "@/components/ui/button";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
import { CodeMirrorEditor } from "../editor/codemirror-editor";
import {
  ComponentBuilderDialog,
  insertionState,
  type BuilderDialogState,
} from "../editor/component-builder";
import {
  emitsMarkdownLink,
  type PropValue,
  type Range,
} from "@/modules/authoring/descriptor";
import { goToLine, insertSnippet, replaceSnippet } from "../editor/commands";
import {
  cursorTools,
  type ComponentInfo,
  type LinkInfo,
} from "../editor/cursor-tools";
import { TagsInput } from "@/components/fields/tags-input";
import { EditorToolbar } from "../editor/toolbar";
import { uploadFile } from "@/modules/files/upload";
import { UploadDialog, type UploadDialogState } from "../editor/upload-dialog";
import { uploadDoors } from "../editor/upload-extension";
import { WarningsPanel } from "../editor/warnings-panel";

export function PageEditor({
  slug,
  initialContent,
  initialTags,
  allSlugs,
  allTags,
  builders,
  isNew,
}: {
  slug: string;
  initialContent: string;
  initialTags: string[];
  allSlugs: string[];
  /** The wiki's page tags this person can read, for suggestion (issue #15). */
  allTags: string[];
  builders: ComponentBuilderSpec[];
  isNew: boolean;
}) {
  const router = useRouter();
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Name of a file whose upload just created it: cancelling the component
  // modal then deletes it (« annuler = rien ne s'est passé », ADR 0012).
  // A ref, because the dialog-close handler must read it synchronously.
  const postUploadName = useRef<string | null>(null);
  const [tags, setTags] = useState(initialTags);
  const [builderDialog, setBuilderDialog] =
    useState<BuilderDialogState | null>(null);
  // The Radix close animation fades the dialog out after builderDialog is
  // nulled, so keep the last state around to render the fading content.
  const lastBuilderDialog = useRef<BuilderDialogState | null>(null);
  if (builderDialog) lastBuilderDialog.current = builderDialog;
  const [upload, setUpload] = useState<UploadDialogState>(null);
  // What the render would ignore; shown after a save attempt found something.
  const [warnings, setWarnings] = useState<PageWarning[]>([]);
  const [isPending, startTransition] = useTransition();

  // Created once (the editor view mounts once); the setters are stable and
  // builders are static per page load, so nothing here goes stale.
  const [extensions] = useState(() => [
    cursorTools({
      builders,
      onEditLink: (info: LinkInfo) =>
        openWikiLinkBuilder(
          {
            text: info.text,
            link: info.href,
            target: info.target,
            hideIfNoAccess: info.hideIfNoAccess,
          },
          { from: info.from, to: info.to }
        ),
      onEditComponent: (info: ComponentInfo) =>
        setBuilderDialog({
          mode: "edit",
          spec: info.spec,
          initial: {
            values: info.values,
            unknownAttributes: info.unknownAttributes,
          },
          range: { from: info.from, to: info.to },
        }),
    }),
    uploadDoors((file) => handleUploadFile(file)),
  ]);

  // Opens a builder with the insertion defaults overlaid by `values`; in
  // edit mode `range` is the source span the submit rewrites.
  function openBuilder(
    spec: ComponentBuilderSpec | undefined,
    missingSpecLabel: string,
    values: Record<string, PropValue>,
    range?: Range
  ) {
    if (!spec) {
      toast.error(`Descripteur introuvable : ${missingSpecLabel}.`);
      return;
    }
    const initial = insertionState(spec);
    for (const [field, value] of Object.entries(values)) {
      if (value !== undefined && value !== "") initial.values[field] = value;
    }
    setBuilderDialog({
      mode: range ? "edit" : "insert",
      spec,
      initial,
      range,
    });
  }

  // The wiki-link builder (emits markdown-link) has its own doors: the
  // toolbar link button and the anchored link pencil (docs/component-builder.md).
  function openWikiLinkBuilder(
    values: Record<string, PropValue>,
    range?: Range
  ) {
    openBuilder(
      builders.find((builder) => emitsMarkdownLink(builder.descriptor)),
      "wiki-link.yaml",
      values,
      range
    );
  }

  function openBuilderForFile(
    componentName: "Image" | "Pdf" | "FileLink",
    fileName: string
  ) {
    openBuilder(
      builders.find((builder) => builder.name === componentName),
      componentName,
      { file: fileName }
    );
  }

  async function handleUploadFile(file: File) {
    setUpload({
      phase: "uploading",
      fileName: file.name,
      size: file.size,
      progress: 0,
    });
    try {
      const uploaded = await uploadFile(file, (progress) =>
        setUpload((current) =>
          current?.phase === "uploading" ? { ...current, progress } : current
        )
      );
      postUploadName.current = uploaded.name;
      if (uploaded.family === "pdf") {
        // Mini-choice: embed the content (<Pdf>) or a download link.
        setUpload({ phase: "pdf-choice", name: uploaded.name });
      } else {
        setUpload(null);
        openBuilderForFile(
          uploaded.family === "image" ? "Image" : "FileLink",
          uploaded.name
        );
      }
    } catch (error) {
      setUpload(null);
      toast.error(
        error instanceof Error ? error.message : "Échec de l'envoi du fichier."
      );
    }
  }

  // Cancelling right after the upload that created the file removes it.
  function discardPostUpload() {
    if (!postUploadName.current) return;
    void discardUploadedFile(postUploadName.current);
    postUploadName.current = null;
    toast.info("Aucun changement n'a été enregistré.");
  }

  function currentContent(): string {
    return viewRef.current?.state.doc.toString() ?? initialContent;
  }

  // First click: ask what the render would ignore, and stop there if anything
  // would be. The author is still in front of the source, so this is the one
  // moment a fix costs nothing — hence a panel rather than a toast, which
  // would vanish while they read it.
  function save() {
    // The keyboard shortcut has no disabled state to stop it, unlike the
    // button: a second Ctrl+S mid-save would start a second save.
    if (isPending) return;
    const content = currentContent();
    startTransition(async () => {
      const found = await lintPage(content, slug);
      if (found.length > 0) {
        setWarnings(found);
        return;
      }
      await persist(content);
    });
  }

  // Ctrl/Cmd+S saves: the reflex of anyone typing a long text. On window
  // rather than in the CodeMirror keymap, so the tags field has it too.
  // Re-bound after each render (no dependency array) so the handler reads the
  // tags and the dialog state of the render it belongs to; a listener costs
  // less than a ref that would have to be kept in step by hand.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s")
        return;
      // A dialog open means the keystroke belongs to the dialog, not the
      // page: the browser keeps its own shortcut, since we take nothing.
      if (builderDialog || upload) return;
      event.preventDefault();
      save();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // « Enregistrer quand même » — the warnings are acknowledged, not fixed.
  function saveAnyway() {
    startTransition(() => persist(currentContent()));
  }

  async function persist(content: string) {
    const result = await savePage({ slug, content, tags });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if ("unchanged" in result) {
      // The toast outlives the navigation (the Toaster lives in the root
      // layout), so the author reads it on the page they land on.
      toast.info("Aucune modification n'a été effectuée.");
    }
    router.push(`/${slug}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="truncate text-lg font-semibold">
        {isNew ? "Créer" : "Modifier"} «&nbsp;{slug}&nbsp;»
      </h1>

      {/* Above the editor, with the title it belongs to: under a page
          several screens tall, the field would be out of reach. */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Tag className="size-4 shrink-0" aria-hidden />
        {/* The tag icon carries the meaning for the eye; the field needs
            its own name for a screen reader, having no <label> of its own. */}
        <TagsInput
          ariaLabel="Tags de la page"
          tags={tags}
          candidates={allTags}
          onChange={setTags}
        />
      </div>

      {/* One anchored bar for everything that acts on the text. The tools
          work on the cursor and the save is never more than a click away, so
          neither may scroll off a long page. It sticks under the site's top
          bar, whose height --chrome-top carries (modules/pages/ui/
          sticky-top-bar.tsx), and bleeds to the column's edges to read as a
          bar rather than as a box. The title stays out of it: pinned, it
          would take the width the tools need without acting on anything.
          One line, and one only above sm: a flex line is filled from each
          item's base width, so a wrapping bar would drop the actions to a
          second row long before the toolbar ever had to scroll — which is
          exactly the row the toolbar is meant to spare us. */}
      <div className="sticky-bar sticky top-(--chrome-top) z-30 -mx-4 flex items-start gap-2 px-4 max-sm:flex-wrap">
        <EditorToolbar
          viewRef={viewRef}
          onRequestLink={(selectionText) =>
            openWikiLinkBuilder({ text: selectionText || undefined })
          }
          builders={builders}
          onRequestComponent={(spec) =>
            setBuilderDialog({
              mode: "insert",
              spec,
              initial: insertionState(spec),
            })
          }
          onRequestUpload={() => fileInputRef.current?.click()}
        />

        {/* Kept together and to the right, whether they share the tools' row
            or, too narrow for that, sit on their own. Both blocks are laid
            out from the top of the bar (items-start) with the same padding
            above them: that, and not centring, is what puts the buttons and
            the icons on one line — the tools carry an indicator under them
            and the buttons do not. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 pt-1.5 max-sm:pb-1.5">
          <Button asChild variant="ghost" size="sm" disabled={isPending}>
            <Link href={`/${slug}`}>Annuler</Link>
          </Button>
          <Button size="sm" onClick={save} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Enregistrer
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) handleUploadFile(file);
        }}
      />

      <CodeMirrorEditor
        initialDoc={initialContent}
        viewRef={viewRef}
        extensions={extensions}
      />

      {warnings.length > 0 && (
        <WarningsPanel
          warnings={warnings}
          isPending={isPending}
          onGoToLine={(line) => viewRef.current && goToLine(viewRef.current, line)}
          onSaveAnyway={saveAnyway}
        />
      )}

      <UploadDialog
        state={upload}
        onOpenChange={(open) => {
          if (open) return;
          // Closing the mini-choice is a post-upload cancellation.
          if (upload?.phase === "pdf-choice") discardPostUpload();
          setUpload(null);
        }}
        onPdfChoice={(component) => {
          if (upload?.phase !== "pdf-choice") return;
          const name = upload.name;
          setUpload(null);
          openBuilderForFile(component, name);
        }}
      />

      <ComponentBuilderDialog
        open={builderDialog !== null}
        onOpenChange={(open) => {
          if (open) return;
          discardPostUpload();
          setBuilderDialog(null);
        }}
        state={builderDialog ?? lastBuilderDialog.current}
        allSlugs={allSlugs}
        onSubmit={(tag) => {
          // The inserted tag references the file: the upload is kept.
          postUploadName.current = null;
          const view = viewRef.current;
          const active = builderDialog ?? lastBuilderDialog.current;
          if (!view || !active) return;
          if (active.mode === "edit" && active.range) {
            replaceSnippet(view, active.range, tag);
          } else {
            insertSnippet(view, tag);
          }
        }}
      />

    </div>
  );
}
