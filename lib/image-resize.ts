import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { filePath } from "./files";

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

  const cachePath = variantPath(name, request, info.mtimeMs);
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

// Cache key folds in the source mtime, so re-uploading under the same name
// (a new file, ADR 0012 forbids silent replacement — but a future overwrite)
// never serves a stale variant.
function variantPath(
  name: string,
  request: ResizeRequest,
  mtimeMs: number
): string {
  const key = createHash("sha1")
    .update(`${name}|${request.width ?? ""}|${request.height ?? ""}|${mtimeMs}`)
    .digest("hex");
  const extension = path.extname(name);
  return path.join(CACHE_DIR, `${key}${extension}`);
}
