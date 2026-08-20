import { beforeEach, describe, expect, it, vi } from "vitest";

// The route only turns getRawContent's answer into HTTP (docs/permissions.md
// § /{slug}/raw): the right to read, the field cut and the order are
// lib/pages.ts's own job, already exercised in lib/pages.test.ts. Mocked here
// so this suite is about status codes, headers, slug handling and ?all
// alone.

const { rawContent } = vi.hoisted(() => ({ rawContent: vi.fn() }));

vi.mock("@/lib/pages", () => ({
  getRawContent: rawContent,
  isRefused: (result: unknown) =>
    typeof result === "object" && result !== null && "refused" in result,
}));

const { GET } = await import("./route");

function get(slug: string, query = "") {
  const encoded = encodeURIComponent(slug);
  return GET(new Request(`http://localhost/${encoded}/raw${query}`), {
    params: Promise.resolve({ slug: encoded }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

const METADATA = { "created-at": "2026-01-05T10:00:00.000Z" };

describe("GET /{slug}/raw", () => {
  it("404s a malformed slug", async () => {
    const response = await get("pas un slug !");
    expect(response.status).toBe(404);
    expect(rawContent).not.toHaveBeenCalled();
  });

  it("redirects an uppercase slug to its lowercase, canonical address, query kept", async () => {
    const response = await GET(new Request("http://localhost/ACCUEIL/raw?all"), {
      params: Promise.resolve({ slug: "ACCUEIL" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/accueil/raw?all"
    );
    expect(rawContent).not.toHaveBeenCalled();
  });

  it("404s a slug nobody wrote", async () => {
    rawContent.mockResolvedValue(null);
    const response = await get("inconnue");
    expect(response.status).toBe(404);
  });

  it("refuses a page this person may not read, without leaking its content", async () => {
    rawContent.mockResolvedValue({ refused: true, ownerName: "Marie Durand" });
    const response = await get("compte-rendu");
    expect(response.status).toBe(403);
  });

  it("serves a page's content as plain readable text by default", async () => {
    rawContent.mockResolvedValue({
      kind: "page",
      content: "Ligne un\nLigne deux",
      metadata: METADATA,
    });
    const response = await get("accueil");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("Ligne un\nLigne deux");
  });

  it("?all serves a page's content and metadata as JSON, metadata nested", async () => {
    rawContent.mockResolvedValue({
      kind: "page",
      content: "# Bonjour",
      metadata: METADATA,
    });
    const response = await get("accueil", "?all");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(await response.json()).toEqual({
      content: "# Bonjour",
      metadata: METADATA,
    });
  });

  it("serves a fiche's field values and metadata as JSON by default — no content to isolate", async () => {
    rawContent.mockResolvedValue({
      kind: "entry",
      fields: { title: "Paie", "form-id": "paie", nom: "Marie" },
      metadata: METADATA,
    });
    const response = await get("paie-marie");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(await response.json()).toEqual({
      title: "Paie",
      "form-id": "paie",
      nom: "Marie",
      metadata: METADATA,
    });
  });

  it("?all serves a fiche exactly the same way as the default", async () => {
    rawContent.mockResolvedValue({
      kind: "entry",
      fields: { title: "Paie", "form-id": "paie", nom: "Marie" },
      metadata: METADATA,
    });
    const response = await get("paie-marie", "?all");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: "Paie",
      "form-id": "paie",
      nom: "Marie",
      metadata: METADATA,
    });
  });
});
