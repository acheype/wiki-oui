import { beforeEach, describe, expect, it, vi } from "vitest";

// The route only turns getRawContent's answer into HTTP (docs/permissions.md
// § /{slug}/raw): the right to read, the field cut and the order are
// lib/pages.ts's own job, already exercised in lib/pages.test.ts. Mocked here
// so this suite is about status codes, headers, slug handling and ?field=
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

describe("GET /{slug}/raw", () => {
  it("404s a malformed slug", async () => {
    const response = await get("pas un slug !");
    expect(response.status).toBe(404);
    expect(rawContent).not.toHaveBeenCalled();
  });

  it("redirects an uppercase slug to its lowercase, canonical address, query kept", async () => {
    const response = await GET(
      new Request("http://localhost/ACCUEIL/raw?field=content"),
      { params: Promise.resolve({ slug: "ACCUEIL" }) }
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/accueil/raw?field=content"
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

  it("serves a page's content and metadata as JSON", async () => {
    const raw = { content: "# Bonjour", "created-at": "2026-01-05T10:00:00.000Z" };
    rawContent.mockResolvedValue(raw);
    const response = await get("accueil");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.json()).toEqual(raw);
  });

  it("serves a fiche's field values and metadata as JSON", async () => {
    const raw = { title: "Paie", "form-id": "paie", nom: "Marie" };
    rawContent.mockResolvedValue(raw);
    const response = await get("paie-marie");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(raw);
  });

  it("?field= narrows the response to that one field's value", async () => {
    rawContent.mockResolvedValue({ title: "Paie", nom: "Marie" });
    const response = await get("paie-marie", "?field=nom");
    expect(response.status).toBe(200);
    expect(await response.json()).toBe("Marie");
  });

  it("?field= 404s a field absent or unreadable, the same way as a missing one", async () => {
    rawContent.mockResolvedValue({ title: "Paie", nom: "Marie" });
    const response = await get("paie-marie", "?field=salaire");
    expect(response.status).toBe(404);
  });

  it("?field=content serves a page's content as plain readable text, not JSON", async () => {
    rawContent.mockResolvedValue({ content: "Ligne un\nLigne deux" });
    const response = await get("accueil", "?field=content");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(await response.text()).toBe("Ligne un\nLigne deux");
  });

  it("still serves other single fields as JSON, quotes and escapes included", async () => {
    rawContent.mockResolvedValue({ chapeau: "Une phrase.\nEt une autre." });
    const response = await get("un-billet", "?field=chapeau");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(await response.text()).toBe('"Une phrase.\\nEt une autre."');
  });
});
