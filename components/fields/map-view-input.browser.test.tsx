import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Serve tiles from a 1x1 data URI, never the real OSM servers: no external
// network in tests (ADR 0032, #31's RGPD/intranet spirit). Leaflet still lays
// out and zooms for real — the whole point of a browser test, which jsdom
// (no layout) cannot do.
vi.mock("./map-pin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./map-pin")>()),
  OSM_TILE_URL:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
}));

import { MapViewInput, type MapViewValue } from "./map-view-input";

// Tailwind isn't compiled in tests, so the widget's `h-52` map box collapses
// to zero and Leaflet initialises unsized. `min-height` gives the container a
// real height the app gets from Tailwind — and, unlike `height`, it isn't
// beaten by MapContainer's inline `height:100%`, so it applies at mount and
// Leaflet measures itself correctly.
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = ".leaflet-container{min-height:300px}";
  document.head.append(style);
});

function Harness() {
  const [value, setValue] = useState<MapViewValue | undefined>(undefined);
  return <MapViewInput value={value} onChange={setValue} />;
}

describe("MapViewInput (browser)", () => {
  it("renders a real Leaflet map whose zoom records the view", async () => {
    const screen = await render(<Harness />);

    const map = document.querySelector<HTMLElement>(".leaflet-container")!;
    expect(map).not.toBeNull();

    // No move yet: the value is empty, so the automatic-framing hint shows.
    await expect
      .element(screen.getByText("Cadrage automatique sur les fiches"))
      .toBeVisible();

    // A real double-click zooms the map (5 -> 6); Leaflet's moveend records
    // the new view into the value, which the caption then displays.
    await userEvent.dblClick(map);
    await expect.element(screen.getByText(/zoom 6/)).toBeVisible();
  });
});
