import { getRawContent, isRefused } from "@/lib/pages";
import { isValidSlug } from "@/lib/slug";

// /{slug}/raw, the equivalent of YesWiki's /raw (docs/permissions.md): a
// handler whose response is text rather than a screen is a route.ts (a
// service dressed as a page.tsx renders HTML, per /api/render), living beside
// edit/ and revisions/ under the same [slug]. All the deciding — the right to
// read, the fields a fiche withholds, the order and shape of what comes
// back — happens in getRawContent() (the access layer, ADR 0025), so this
// file only turns its answer into an HTTP response.

type Params = { params: Promise<{ slug: string }> };

const HEADERS = { "X-Content-Type-Options": "nosniff" } as const;

function notFound(message: string): Response {
  return new Response(message, { status: 404, headers: HEADERS });
}

export async function GET(request: Request, { params }: Params) {
  const slug = decodeURIComponent((await params).slug);
  const url = new URL(request.url);

  // Mirrors the show handler's own redirect (app/(site)/[slug]/page.tsx):
  // uppercase variants resolve to the canonical lowercase slug, ?all
  // carried along.
  const lowercased = slug.toLowerCase();
  if (slug !== lowercased && isValidSlug(lowercased)) {
    return Response.redirect(
      new URL(`/${lowercased}/raw${url.search}`, url),
      302
    );
  }
  if (!isValidSlug(slug)) {
    return notFound("Page introuvable");
  }

  const raw = await getRawContent(slug);
  if (!raw) {
    return notFound("Page introuvable");
  }
  if (isRefused(raw)) {
    return new Response("Vous n'avez pas accès à cette page.", {
      status: 403,
      headers: HEADERS,
    });
  }

  // YesWiki's own /raw, the reference this handler mirrors, returns a page's
  // content as plain readable text — \n a line break, not two characters to
  // decode. That default only applies to a page: a fiche has no single
  // "content" to isolate, so it keeps showing every field plus metadata,
  // exactly what ?all also gives back. ?all switches a page to that same
  // full JSON view, the one this handler always served before this default.
  const all = url.searchParams.has("all");
  const isPage = Object.hasOwn(raw, "content");
  if (!all && isPage && typeof raw.content === "string") {
    return new Response(raw.content, {
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(raw), {
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
