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
  // uppercase variants resolve to the canonical lowercase slug, ?field=
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

  // ?field=… narrows the response to one field's own value, still JSON —
  // an unreadable field is absent from `raw` exactly like one that does not
  // exist, so the two answer the same 404 rather than one leaking the other.
  const field = url.searchParams.get("field");
  if (field !== null && !Object.hasOwn(raw, field)) {
    return notFound("Champ introuvable");
  }
  const body = field !== null ? raw[field] : raw;

  return new Response(JSON.stringify(body), {
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
