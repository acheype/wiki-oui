import { statSync } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { FILE_FAMILIES, type FileFamily } from "@/modules/authoring/descriptor";
import { captureFileName } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { wikiConfig } from "@/wiki.config";

// Uploaded files (ADR 0012): the files/ directory at the repo root is the
// only source of truth — no Prisma table. Every access goes through this
// module, the mounting point of a future S3 adapter (backlog).

export const FILES_DIR = path.join(process.cwd(), "files");

export type { FileFamily };

export interface StoredFile {
  name: string;
  family: FileFamily;
  size: number;
  modifiedAt: Date;
}

// basename() bars path traversal: an uploaded-file name never has a folder.
export function filePath(name: string): string {
  return path.join(FILES_DIR, path.basename(name));
}

/** URL served by the files API service (GET /api/files/[name]). */
export function fileUrl(name: string): string {
  return `/api/files/${encodeURIComponent(path.basename(name))}`;
}

/** The family routes an upload to its component; null = extension not allowed. */
export function fileFamily(name: string): FileFamily | null {
  const extension = path.extname(name).slice(1).toLowerCase();
  const { allowedExtensions } = wikiConfig.upload;
  for (const family of FILE_FAMILIES) {
    if ((allowedExtensions[family] as readonly string[]).includes(extension)) {
      return family;
    }
  }
  return null;
}

// Sync on purpose: the wiki components showing sizes (<FileLink>) must stay
// synchronous — the ComponentBuilder preview renders them with the page
// pipeline where async client components are not an option.
export function fileSizeSync(name: string): number | null {
  try {
    return statSync(filePath(name)).size;
  } catch {
    return null;
  }
}

export async function listFiles(family?: FileFamily): Promise<StoredFile[]> {
  let entries: string[];
  try {
    entries = await readdir(FILES_DIR);
  } catch {
    return []; // the directory appears with the first upload
  }
  const files = await Promise.all(
    entries.sort().map(async (name): Promise<StoredFile | null> => {
      const fileFamilyName = fileFamily(name);
      if (fileFamilyName === null) return null;
      if (family && fileFamilyName !== family) return null;
      const info = await stat(filePath(name));
      if (!info.isFile()) return null;
      return {
        name,
        family: fileFamilyName,
        size: info.size,
        modifiedAt: info.mtime,
      };
    })
  );
  return files.filter((file) => file !== null);
}

// Original name slugified (lib/slug.ts), extension normalized; empty base
// (anonymous pasted capture) gets a generated name.
export function storageName(originalName: string): string {
  const extension = path.extname(originalName).slice(1).toLowerCase();
  const base = slugify(path.basename(originalName, path.extname(originalName)));
  return base ? `${base}.${extension}` : captureFileName(extension);
}

/**
 * Writes the data under the slugified name; a collision gets a numeric
 * suffix (logo-2.png) — never a silent replacement (ADR 0012). Returns the
 * final name.
 */
export async function saveFile(
  originalName: string,
  data: Uint8Array
): Promise<string> {
  await mkdir(FILES_DIR, { recursive: true });
  const slugged = storageName(originalName);
  const extension = path.extname(slugged);
  const base = slugged.slice(0, -extension.length);
  for (let attempt = 0; ; attempt++) {
    const name = attempt === 0 ? slugged : `${base}-${attempt + 1}${extension}`;
    try {
      // wx flag: fail on existing file instead of overwriting it.
      await writeFile(filePath(name), data, { flag: "wx" });
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

export async function deleteFile(name: string): Promise<void> {
  await unlink(filePath(name));
}
