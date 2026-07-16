import type { ResizeRequest } from "./image-resize";

// The URL of an uploaded image at a chosen display size (docs/forms.md): the
// `?w=&h=` box the files API resizes into. A pure builder, kept apart from
// image-resize.ts so client components can call it without pulling sharp and
// node:fs into their bundle.

/**
 * The files-API URL bounding `name` to the given box. Both dimensions are a
 * bounding box, never a stretch: the image keeps its ratio and the tighter
 * dimension wins. An empty box serves the untouched original.
 */
export function imageUrl(name: string, box: ResizeRequest = {}): string {
  const query = new URLSearchParams();
  if (box.width) query.set("w", String(box.width));
  if (box.height) query.set("h", String(box.height));
  const suffix = [...query].length ? `?${query}` : "";
  return `/api/files/${encodeURIComponent(name)}${suffix}`;
}

/** Bound to the page's reading width when a field declares no size. */
export const DEFAULT_IMAGE_WIDTH = 800;
