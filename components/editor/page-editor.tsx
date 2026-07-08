"use client";

import type { EditorView } from "@codemirror/view";
import { Loader2, Save, Tag } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePage } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CodeMirrorEditor } from "./codemirror-editor";
import { isInTable } from "./commands";
import { TagsInput } from "./tags-input";
import { EditorToolbar } from "./toolbar";

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
  const viewRef = useRef<EditorView | null>(null);
  const [tags, setTags] = useState(initialTags);
  const [inTable, setInTable] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    const content = viewRef.current?.state.doc.toString() ?? initialContent;
    startTransition(async () => {
      const result = await savePage({ slug, content, tags });
      if (result?.error) {
        toast.error(result.error);
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

      <EditorToolbar viewRef={viewRef} allSlugs={allSlugs} inTable={inTable} />

      <CodeMirrorEditor
        initialDoc={initialContent}
        viewRef={viewRef}
        onUpdate={(view) => setInTable(isInTable(view))}
      />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Tag className="size-4 shrink-0" aria-hidden />
        <TagsInput tags={tags} onChange={setTags} />
      </div>
    </div>
  );
}
