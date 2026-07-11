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
import {
  insertLink,
  insertSnippet,
  replaceLink,
  replaceSnippet,
  type LinkValue,
} from "./commands";
import {
  cursorTools,
  type ComponentInfo,
  type LinkInfo,
} from "./cursor-tools";
import { LinkDialog } from "./link-dialog";
import { TagsInput } from "./tags-input";
import { EditorToolbar } from "./toolbar";

type LinkDialogState = {
  open: boolean;
  mode: "insert" | "edit";
  value: LinkValue;
  /** Range of the link being edited; absent in insert mode. */
  range?: { from: number; to: number };
};

const closedLinkDialog: LinkDialogState = {
  open: false,
  mode: "insert",
  value: { text: "", href: "", target: "self" },
};

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
  const [tags, setTags] = useState(initialTags);
  const [linkDialog, setLinkDialog] = useState(closedLinkDialog);
  const [builderDialog, setBuilderDialog] = useState(closedBuilderDialog);
  const [isPending, startTransition] = useTransition();

  // Created once (the editor view mounts once); the setters are stable and
  // builders are static per page load, so nothing here goes stale.
  const [extensions] = useState(() => [
    cursorTools({
      builders,
      onEditLink: (info: LinkInfo) =>
        setLinkDialog({
          open: true,
          mode: "edit",
          value: { text: info.text, href: info.href, target: info.target },
          range: { from: info.from, to: info.to },
        }),
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
  ]);

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
          setLinkDialog({
            ...closedLinkDialog,
            open: true,
            value: { ...closedLinkDialog.value, text: selectionText },
          })
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

      <ComponentBuilderDialog
        open={builderDialog.open}
        onOpenChange={(open) =>
          setBuilderDialog(
            open ? builderDialog : { ...builderDialog, open: false }
          )
        }
        spec={builderDialog.spec}
        mode={builderDialog.mode}
        initial={builderDialog.initial}
        allSlugs={allSlugs}
        onSubmit={(tag) => {
          if (!viewRef.current) return;
          if (builderDialog.mode === "edit" && builderDialog.range) {
            replaceSnippet(viewRef.current, builderDialog.range, tag);
          } else {
            insertSnippet(viewRef.current, tag);
          }
        }}
      />

      <LinkDialog
        open={linkDialog.open}
        onOpenChange={(open) =>
          setLinkDialog(open ? linkDialog : { ...linkDialog, open: false })
        }
        mode={linkDialog.mode}
        initial={linkDialog.value}
        allSlugs={allSlugs}
        onInsert={(link) => {
          if (!viewRef.current) return;
          if (linkDialog.mode === "edit" && linkDialog.range) {
            replaceLink(viewRef.current, linkDialog.range, link);
          } else {
            insertLink(viewRef.current, link);
          }
        }}
      />
    </div>
  );
}
