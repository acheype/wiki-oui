import { render } from "vitest-browser-react";
import { describe, expect, it } from "vitest";
import { InlineContainment } from "./inline-containment";

// A position:fixed child — what an author's literal style={{position:'fixed'}}
// produces inside a fiche — must resolve against the containment box, not the
// viewport (#29, ADR 0032). jsdom returns zeroed rects, so only a real browser
// sees this. Geometry assertions, never a screenshot (ADR 0032).

describe("InlineContainment (browser)", () => {
  it("confines a position:fixed child to its box, not the viewport", async () => {
    await render(
      <div style={{ width: "300px", marginLeft: "40px", marginTop: "30px" }}>
        <InlineContainment>
          {/* In-flow content gives the box a height; the fixed child is out of
              flow and would otherwise leave it zero-tall. */}
          <div style={{ height: "200px" }} />
          <div
            data-testid="fixed"
            style={{ position: "fixed", inset: 0, background: "red" }}
          />
        </InlineContainment>
      </div>
    );

    const fixed = document.querySelector<HTMLElement>('[data-testid="fixed"]')!;
    const box = fixed.parentElement!; // the isolate/contain div
    const fixedRect = fixed.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    // Confined: the fixed child fills the containment box.
    expect(Math.round(fixedRect.left)).toBe(Math.round(boxRect.left));
    expect(Math.round(fixedRect.top)).toBe(Math.round(boxRect.top));
    expect(Math.round(fixedRect.width)).toBe(Math.round(boxRect.width));
    expect(Math.round(fixedRect.height)).toBe(Math.round(boxRect.height));

    // And not the viewport: it neither starts at the top-left corner nor spans
    // the whole window — which is exactly what an unconfined fixed child would.
    expect(fixedRect.left).toBeGreaterThan(0);
    expect(fixedRect.top).toBeGreaterThan(0);
    expect(fixedRect.width).toBeLessThan(window.innerWidth);
    expect(fixedRect.height).toBeLessThan(window.innerHeight);
  });
});
