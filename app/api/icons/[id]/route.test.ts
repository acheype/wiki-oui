import { describe, expect, it } from "vitest";
import { GET } from "./route";

function get(id: string) {
  const encoded = encodeURIComponent(id);
  return GET(new Request(`http://localhost/api/icons/${encoded}`), {
    params: Promise.resolve({ id: encoded }),
  });
}

describe("GET /api/icons/[id]", () => {
  it("serves the SVG of a known icon, cached hard", async () => {
    const response = await get("lucide:settings");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toContain("<svg");
  });

  it("404s an unknown icon id", async () => {
    const response = await get("lucide:definitely-not-a-real-icon");
    expect(response.status).toBe(404);
  });

  it("404s a malformed id (no set prefix)", async () => {
    const response = await get("settings");
    expect(response.status).toBe(404);
  });
});
