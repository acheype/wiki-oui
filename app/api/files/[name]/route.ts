import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileFamily, filePath } from "@/lib/files";

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
    "Content-Length": String(info.size),
    "Content-Type": INLINE_TYPES[extension] ?? "application/octet-stream",
  });
  if (extension === "svg") {
    headers.set("Content-Security-Policy", "sandbox");
  }
  if (family === "other") {
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }

  const stream = Readable.toWeb(
    createReadStream(filePath(name))
  ) as ReadableStream;
  return new Response(stream, { headers });
}
