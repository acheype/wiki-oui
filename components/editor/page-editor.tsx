"use client";

import type { EditorView } from "@codemirror/view";
import { Loader2, Save, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePage } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CodeMirrorEditor } from "./codemirror-editor";
import { insertLink, replaceLink, type LinkValue } from "./commands";
import { cursorTools, type LinkInfo } from "./cursor-tools";
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

export function PageEditor({
  slug,
  initialContent,
  initialTags,
  allSlugs,
  isNew,
}: {
  slug: string;
  initialContent: string;
  initialTags: string[];
  allSlugs: string[];
  isNew: boolean;
}) {
  const router = useRouter();
  const viewRef = useRef<EditorView | null>(null);
  const [tags, setTags] = useState(initialTags);
  const [linkDialog, setLinkDialog] = useState(closedLinkDialog);
  const [isPending, startTransition] = useTransition();

  // Created once (the editor view mounts once); setLinkDialog is stable so
  // the extension's callback never goes stale.
  const [extensions] = useState(() => [
    cursorTools((info: LinkInfo) =>
      setLinkDialog({
        open: true,
        mode: "edit",
        value: { text: info.text, href: info.href, target: info.target },
        range: { from: info.from, to: info.to },
      })
    ),
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
