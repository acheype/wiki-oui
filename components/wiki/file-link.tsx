import { FileDown } from "lucide-react";
import { fileSizeSync, fileUrl } from "@/lib/files";
import { formatFileSize } from "@/lib/format";

export type FileLinkProps = {
  /** Uploaded file name (files/ directory, ADR 0012). */
  file?: string;
  /** Link text; empty shows the file name. */
  text?: string;
  /** Hover text (HTML title). */
  title?: string;
};

// Download link showing the file name and its size (docs/architecture.md).
export function FileLink({ file, text, title }: FileLinkProps) {
  if (!file) return null;
  const size = fileSizeSync(file);
  return (
    <a
      href={fileUrl(file)}
      download
      title={title}
      className="inline-flex items-center gap-1.5"
    >
      <FileDown className="size-4 shrink-0" aria-hidden />
      {text || file}
      {size !== null && (
        <span className="text-sm text-muted-foreground">
          ({formatFileSize(size)})
        </span>
      )}
    </a>
  );
}
