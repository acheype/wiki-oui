import { beforeEach, describe, expect, it, vi } from "vitest";

// The route only turns getRawContent's answer into HTTP (docs/permissions.md
// § /{slug}/raw): the right to read and the field cut are lib/pages.ts's own
// job, already exercised in lib/pages.test.ts. Mocked here so this suite is
// about status codes, headers and slug handling alone.

const { rawContent } = vi.hoisted(() => ({ rawContent: vi.fn() }));

vi.mock("@/lib/pages", () => ({
  getRawContent: rawContent,
  isRefused: (result: unknown) =>
    typeof result === "object" && result !== null && "refused" in result,
}));

const { GET } = await import("./route");

function get(slug: string) {
  const encoded = encodeURIComponent(slug);
  return GET(new Request(`http://localhost/${encoded}/raw`), {
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

  it("redirects an uppercase slug to its lowercase, canonical address", async () => {
    const response = await GET(new Request("http://localhost/ACCUEIL/raw"), {
      params: Promise.resolve({ slug: "ACCUEIL" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost/accueil/raw");
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

  it("serves an MDX page's source as text/plain", async () => {
    rawContent.mockResolvedValue({ contentType: "text/plain", body: "# Bonjour" });
    const response = await get("accueil");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("# Bonjour");
  });

  it("serves a fiche's field values as JSON", async () => {
    const body = JSON.stringify({ title: "Paie", nom: "Marie" });
    rawContent.mockResolvedValue({ contentType: "application/json", body });
    const response = await get("paie-marie");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(await response.text()).toBe(body);
  });
});
