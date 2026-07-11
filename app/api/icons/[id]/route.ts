import { iconSvg } from "@/lib/icons";

type Params = { params: Promise<{ id: string }> };

// Serves one icon as standalone SVG for the client <Icon> (ADR 0013 icon
// hybrid): the embedded Iconify sets stay server-side, so a component using an
// icon (e.g. <Button>) can be a client component without bundling that data.
// The id is an Iconify id like `lucide:settings` (its colon URL-encoded).
// Icons are immutable, so cache hard.
export async function GET(_request: Request, { params }: Params) {
  const id = decodeURIComponent((await params).id);
  const svg = iconSvg(id);
  if (svg === null) {
    return new Response("Icône introuvable", { status: 404 });
  }
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
