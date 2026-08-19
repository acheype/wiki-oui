import { getRawContent, isRefused } from "@/lib/pages";
import { isValidSlug } from "@/lib/slug";

// /{slug}/raw, the equivalent of YesWiki's /raw (docs/permissions.md): a
// handler whose response is text rather than a screen is a route.ts (a
// service dressed as a page.tsx renders HTML, per /api/render), living beside
// edit/ and revisions/ under the same [slug]. All the deciding — the right to
// read, the fields a fiche withholds — happens in getRawContent() (the access
// layer, ADR 0025), so this file only turns its answer into an HTTP response.

type Params = { params: Promise<{ slug: string }> };

const HEADERS = { "X-Content-Type-Options": "nosniff" } as const;

function pageNotFound(): Response {
  return new Response("Page introuvable", { status: 404, headers: HEADERS });
}

export async function GET(request: Request, { params }: Params) {
  const slug = decodeURIComponent((await params).slug);

  // Mirrors the show handler's own redirect (app/(site)/[slug]/page.tsx):
  // uppercase variants resolve to the canonical lowercase slug.
  const lowercased = slug.toLowerCase();
  if (slug !== lowercased && isValidSlug(lowercased)) {
    return Response.redirect(new URL(`/${lowercased}/raw`, request.url), 302);
  }
  if (!isValidSlug(slug)) {
    return pageNotFound();
  }

  const raw = await getRawContent(slug);
  if (!raw) {
    return pageNotFound();
  }
  if (isRefused(raw)) {
    return new Response("Vous n'avez pas accès à cette page.", {
      status: 403,
      headers: HEADERS,
    });
  }

  return new Response(raw.body, {
    headers: {
      ...HEADERS,
      "Content-Type": `${raw.contentType}; charset=utf-8`,
    },
  });
}
