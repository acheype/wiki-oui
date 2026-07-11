import { searchIcons } from "@/lib/icons";

// Icon picker search (docs/architecture.md, v0.2): the query runs against
// the embedded Iconify sets on the server, so their data never ships to the
// client. Returns ready-to-inline SVG markup.
export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  return Response.json({ icons: searchIcons(query) });
}
