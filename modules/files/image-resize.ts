import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { filePath } from "./storage";

// On-demand image resizing (docs/forms.md): the pool original stays intact,
// the variant is computed once with sharp and cached on disk. A reusable
// service — the <Image> component of pages can lean on it too. The cache
// lives outside files/ so the pool stays the sole source of truth (ADR 0012).

const CACHE_DIR = path.join(process.cwd(), ".image-cache");

// Never rasterize an svg (it's scalable and sandboxed as-is) or a format
// sharp can't decode; those fall back to the untouched original.
const RESIZABLE = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "tif"]);

export interface ResizeRequest {
  width?: number;
  height?: number;
}

/** Parses ?w=&h= into a bounded request, or null when neither is asked. */
export function parseResizeRequest(params: URLSearchParams): ResizeRequest | null {
  const width = boundedDimension(params.get("w"));
  const height = boundedDimension(params.get("h"));
  if (width === undefined && height === undefined) return null;
  return { width, height };
}

const MAX_DIMENSION = 4000;

function boundedDimension(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return Math.min(value, MAX_DIMENSION);
}

export function isResizable(name: string): boolean {
  return RESIZABLE.has(path.extname(name).slice(1).toLowerCase());
}

// The resized variant's bytes, computed once then read from the disk cache.
// Returns null when the source can't be resized (caller serves the original).
export async function resizedVariant(
  name: string,
  request: ResizeRequest
): Promise<Buffer | null> {
  if (!isResizable(name)) return null;
  const source = filePath(name);
  const info = await stat(source).catch(() => null);
  if (!info?.isFile()) return null;

  const cachePath = variantPath(name, request, info);
  const cached = await readFile(cachePath).catch(() => null);
  if (cached) return cached;

  // `inside` fit + no enlargement: bound the image to the box, never upscale.
  const output = await sharp(source)
    .resize({
      width: request.width,
      height: request.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, output);
  return output;
}

/** What makes a file's bytes distinguishable without reading them. */
export interface FileStamp {
  mtimeMs: number;
  size: number;
}

/**
 * Identity of the bytes a files URL yields *right now*: the pool name, the
 * requested box, and the source's stamp. Serves twice — as the disk cache's
 * key and as the HTTP ETag — so the cache and the browser can never disagree
 * on what "the same image" means.
 *
 * ADR 0012 forbids silent replacement (`saveFile` uses the `wx` flag), but a
 * delete frees the name for a different file: the stamp is what makes that
 * new file a different resource. mtime alone would tie on a same-millisecond
 * reupload, so size joins it — the classic weak validator of web servers. A
 * true guarantee would hash the bytes, which costs reading 10 MB to save
 * sending 10 MB.
 */
export function variantKey(
  name: string,
  box: ResizeRequest,
  stamp: FileStamp
): string {
  return createHash("sha1")
    .update(
      `${name}|${box.width ?? ""}|${box.height ?? ""}|${stamp.mtimeMs}|${stamp.size}`
    )
    .digest("hex");
}

function variantPath(
  name: string,
  request: ResizeRequest,
  stamp: FileStamp
): string {
  const extension = path.extname(name);
  return path.join(CACHE_DIR, `${variantKey(name, request, stamp)}${extension}`);
}
