import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileFamily, filePath } from "@/modules/files/storage";
import { parseResizeRequest, resizedVariant, variantKey } from "@/modules/files/image-resize";

const INLINE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

type Params = { params: Promise<{ name: string }> };

// The client replays the ETag we handed it; `*` means "any representation".
// The header carries a list, and a shared cache may weaken a tag with `W/`,
// which compares equal for our purpose — we only ever serve whole bytes.
function isFresh(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .includes(etag);
}

// Serves an uploaded file with the ADR 0012 policy: nosniff everywhere,
// images and pdf inline, svg sandboxed by CSP (an svg is XML that can embed
// script — inert once sandboxed, visually intact), the `other` family always
// as attachment (never rendered as a document on our origin).
export async function GET(request: Request, { params }: Params) {
  const name = path.basename(decodeURIComponent((await params).name));
  const family = fileFamily(name);
  const info = await stat(filePath(name)).catch(() => null);
  if (family === null || info === null || !info.isFile()) {
    return new Response("Fichier introuvable", { status: 404 });
  }

  const extension = path.extname(name).slice(1).toLowerCase();
  const headers = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Content-Type": INLINE_TYPES[extension] ?? "application/octet-stream",
  });

  // `no-cache` is HTTP's worst-named directive: it stores the response but
  // never reuses it without asking. That question is what keeps this correct
  // when a name is recycled (delete then reupload) — the stamp changes, the
  // ETag differs, and the browser is handed the new bytes. `immutable` would
  // promise the opposite and strand readers on the old image, since a files
  // URL names a file, not its content. The saving is the body, not the trip:
  // a 304 is ~150 bytes where the image is tens of kilobytes.
  const resize = parseResizeRequest(new URL(request.url).searchParams);
  const servedBox = family === "image" && resize ? resize : {};
  const etag = `"${variantKey(name, servedBox, info)}"`;
  headers.set("ETag", etag);
  headers.set("Cache-Control", "no-cache");
  if (isFresh(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  if (extension === "svg") {
    headers.set("Content-Security-Policy", "sandbox");
  }
  if (family === "other") {
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }

  // ?w=&h= serves a cached resized variant (docs/forms.md); a non-image or
  // undecodable source falls through to the untouched original.
  if (family === "image" && resize) {
    const variant = await resizedVariant(name, resize);
    if (variant) {
      headers.set("Content-Length", String(variant.length));
      return new Response(new Uint8Array(variant), { headers });
    }
  }

  headers.set("Content-Length", String(info.size));
  const stream = Readable.toWeb(
    createReadStream(filePath(name))
  ) as ReadableStream;
  return new Response(stream, { headers });
}
