"use client";

import type { EditorView } from "@codemirror/view";
import { Loader2, Save, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePage } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { ComponentBuilderSpec } from "@/lib/component-descriptors";
import { CodeMirrorEditor } from "./codemirror-editor";
import {
  ComponentBuilderDialog,
  insertionState,
  type BuilderState,
} from "./component-builder";
import { emitsMarkdownLink } from "@/lib/component-descriptor";
import { insertSnippet, replaceSnippet } from "./commands";
import {
  cursorTools,
  type ComponentInfo,
  type LinkInfo,
} from "./cursor-tools";
import { TagsInput } from "./tags-input";
import { EditorToolbar } from "./toolbar";
import { deleteUploadedFile, uploadFile } from "./upload";
import { UploadDialog, type UploadDialogState } from "./upload-dialog";
import { uploadDoors } from "./upload-extension";

type BuilderDialogState = {
  open: boolean;
  mode: "insert" | "edit";
  spec: ComponentBuilderSpec | null;
  initial: BuilderState | null;
  /** Range of the tag being edited; absent in insert mode. */
  range?: { from: number; to: number };
};

const closedBuilderDialog: BuilderDialogState = {
  open: false,
  mode: "insert",
  spec: null,
  initial: null,
};

export function PageEditor({
  slug,
  initialContent,
  initialTags,
  allSlugs,
  builders,
  isNew,
}: {
  slug: string;
  initialContent: string;
  initialTags: string[];
  allSlugs: string[];
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
  const [builderDialog, setBuilderDialog] = useState(closedBuilderDialog);
  const [upload, setUpload] = useState<UploadDialogState>(null);
  const [isPending, startTransition] = useTransition();

  // Created once (the editor view mounts once); the setters are stable and
  // builders are static per page load, so nothing here goes stale.
  const [extensions] = useState(() => [
    cursorTools({
      builders,
      onEditLink: (info: LinkInfo) =>
        openWikiLinkBuilder(
          { text: info.text, link: info.href, target: info.target },
          { from: info.from, to: info.to }
        ),
      onEditComponent: (info: ComponentInfo) =>
        setBuilderDialog({
          open: true,
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
    values: Record<string, string | undefined>,
    range?: { from: number; to: number }
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
      ...closedBuilderDialog,
      open: true,
      mode: range ? "edit" : "insert",
      spec,
      initial,
      range,
    });
  }

  // The wiki-link builder (emits markdown-link) has its own doors: the
  // toolbar link button and the anchored link pencil (docs/component-builder.md).
  function openWikiLinkBuilder(
    values: Record<string, string | undefined>,
    range?: { from: number; to: number }
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
    void deleteUploadedFile(postUploadName.current);
    postUploadName.current = null;
    toast.info("Annulé : rien n'a été conservé.");
  }

  function save() {
    const content = viewRef.current?.state.doc.toString() ?? initialContent;
    startTransition(async () => {
      const result = await savePage({ slug, content, tags });
      if (result && "error" in result) {
        toast.error(result.error);
      } else if (result && "unchanged" in result) {
        // Back to the show page anyway: the toast outlives the navigation
        // (the Toaster lives in the root layout).
        toast.info("Aucune modification : la page est déjà à jour.");
        router.push(`/${slug}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {isNew ? "Créer" : "Modifier"} «&nbsp;{slug}&nbsp;»
        </h1>
        <Button asChild variant="ghost" disabled={isPending}>
          <Link href={`/${slug}`}>Annuler</Link>
        </Button>
        <Button onClick={save} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Enregistrer
        </Button>
      </div>

      <EditorToolbar
        viewRef={viewRef}
        onRequestLink={(selectionText) =>
          openWikiLinkBuilder({ text: selectionText || undefined })
        }
        builders={builders}
        onRequestComponent={(spec) =>
          setBuilderDialog({
            ...closedBuilderDialog,
            open: true,
            spec,
            initial: insertionState(spec),
          })
        }
        onRequestUpload={() => fileInputRef.current?.click()}
      />
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

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Tag className="size-4 shrink-0" aria-hidden />
        <TagsInput tags={tags} onChange={setTags} />
      </div>

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
        open={builderDialog.open}
        onOpenChange={(open) => {
          if (!open) discardPostUpload();
          setBuilderDialog(
            open ? builderDialog : { ...builderDialog, open: false }
          );
        }}
        spec={builderDialog.spec}
        mode={builderDialog.mode}
        initial={builderDialog.initial}
        allSlugs={allSlugs}
        onSubmit={(tag) => {
          // The inserted tag references the file: the upload is kept.
          postUploadName.current = null;
          if (!viewRef.current) return;
          if (builderDialog.mode === "edit" && builderDialog.range) {
            replaceSnippet(viewRef.current, builderDialog.range, tag);
          } else {
            insertSnippet(viewRef.current, tag);
          }
        }}
      />

    </div>
  );
}
