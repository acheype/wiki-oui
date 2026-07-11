import { statSync } from "node:fs";
import path from "node:path";

// Uploaded files (ADR 0012): the files/ directory at the repo root is the
// only source of truth — no Prisma table. Every access goes through this
// module, the mounting point of a future S3 adapter (backlog).

export const FILES_DIR = path.join(process.cwd(), "files");

// basename() bars path traversal: an uploaded-file name never has a folder.
export function filePath(name: string): string {
  return path.join(FILES_DIR, path.basename(name));
}

/** URL served by the files API service (GET /api/files/[name]). */
export function fileUrl(name: string): string {
  return `/api/files/${encodeURIComponent(path.basename(name))}`;
}

// Sync on purpose: the wiki components showing sizes (<FileLink>) must stay
// synchronous — the ComponentBuilder preview renders them with
// renderToStaticMarkup, which cannot await.
export function fileSizeSync(name: string): number | null {
  try {
    return statSync(filePath(name)).size;
  } catch {
    return null;
  }
}
