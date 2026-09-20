// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Collapsible } from "./wiki-components/collapsible";

describe("<Collapsible>", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('<svg data-testid="loaded-icon"></svg>'))
    );
  });

  it("is closed by default and toggles its searchable panel from the full title row", async () => {
    const user = userEvent.setup();
    render(<Collapsible title="À savoir">Information secondaire</Collapsible>);

    const trigger = screen.getByRole("button", { name: "À savoir" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const panel = screen.getByText("Information secondaire").parentElement;
    expect(panel?.getAttribute("hidden")).toBe("until-found");

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hasAttribute("hidden")).toBe(false);

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the requested heading, decorative icon and plus/minus state", async () => {
    render(
      <Collapsible
        title="Détails"
        headingLevel="h3"
        icon="lucide:info"
        toggleIcon="plus-minus"
        defaultOpen
      >
        Texte
      </Collapsible>
    );

    expect(screen.getByRole("heading", { level: 3, name: "Détails" })).toBeTruthy();
    expect(screen.getByText("−").parentElement?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    await waitFor(() =>
      expect(document.querySelector('[data-testid="loaded-icon"]')).toBeTruthy()
    );
  });

  it("allows nested blocks to toggle independently", async () => {
    const user = userEvent.setup();
    render(
      <Collapsible title="Parent" defaultOpen>
        <Collapsible title="Enfant">Dedans</Collapsible>
      </Collapsible>
    );

    const parent = screen.getByRole("button", { name: "Parent" });
    const child = screen.getByRole("button", { name: "Enfant" });
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(child.getAttribute("aria-expanded")).toBe("false");
    await user.click(child);
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(child.getAttribute("aria-expanded")).toBe("true");
  });

  it("resolves appearance colors and keeps author presentation on the root", () => {
    const { container, rerender } = render(
      <Collapsible
        title="Contour"
        className="author-class"
        style={{ marginTop: 12 }}
      >
        Texte
      </Collapsible>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-border");
    expect(root.className).toContain("author-class");
    expect(root.style.marginTop).toBe("12px");

    rerender(
      <Collapsible title="Mixte" display="outline-highlight">
        Texte
      </Collapsible>
    );
    expect(root.className).toContain("border");
    expect(root.className).toContain("data-open:bg-accent");

    rerender(
      <Collapsible title="Surbrillance" display="highlight" color="danger">
        Texte
      </Collapsible>
    );
    expect(root.className).toContain("data-open:bg-destructive");
    expect(root.className.split(" ")).not.toContain("border");
  });
});
