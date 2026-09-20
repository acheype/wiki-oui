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
    const { container } = render(
      <Collapsible title="À savoir">Information secondaire</Collapsible>
    );

    const trigger = screen.getByRole("button", { name: "À savoir" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const panel = screen.getByText("Information secondaire").parentElement;
    expect(panel?.getAttribute("hidden")).toBe("until-found");
    expect(panel?.className).toContain("print:[content-visibility:visible]!");
    expect(container.querySelector(".lucide-chevron-down")).toBeTruthy();
    expect(container.querySelector(".lucide-chevron-up")).toBeNull();

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector(".lucide-chevron-down")).toBeNull();
    expect(container.querySelector(".lucide-chevron-up")?.getAttribute("class")).toContain(
      "size-5"
    );

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the requested heading, decorative icon and plus/minus state", async () => {
    const user = userEvent.setup();
    const { container } = render(
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
    expect(container.querySelector(".lucide-minus")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(container.querySelector(".lucide-minus")?.getAttribute("class")).toContain(
      "size-5"
    );
    expect(container.querySelector(".lucide-plus")).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('[data-testid="loaded-icon"]')).toBeTruthy()
    );
    expect(
      document.querySelector('[data-testid="loaded-icon"]')?.parentElement
        ?.parentElement?.className
    ).toContain("size-5");
    expect(
      document.querySelector('[data-testid="loaded-icon"]')?.parentElement
        ?.parentElement?.className
    ).toContain("text-xl");

    await user.click(screen.getByRole("button", { name: "Détails" }));
    expect(container.querySelector(".lucide-minus")).toBeNull();
    expect(container.querySelector(".lucide-plus")?.getAttribute("class")).toContain(
      "size-5"
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
    expect(screen.getByRole("button", { name: "Contour" }).className).toContain(
      "focus-visible:ring-inset"
    );

    rerender(
      <Collapsible title="Teinté" display="outline-tinted" color="primary">
        Texte
      </Collapsible>
    );
    expect(root.className).toContain("border");
    expect(root.className).toContain("bg-primary/10");

    rerender(
      <Collapsible title="Mixte" display="outline-highlight" color="success">
        Texte
      </Collapsible>
    );
    expect(root.className).toContain("border");
    expect(root.className).toContain("data-open:bg-success/10");
    expect(screen.getByRole("button", { name: "Mixte" }).className).toContain(
      "hover:bg-success/10"
    );

    rerender(
      <Collapsible title="Surbrillance" display="highlight" color="danger">
        Texte
      </Collapsible>
    );
    expect(root.className).toContain("data-open:bg-destructive/10");
    expect(root.className.split(" ")).not.toContain("border");
  });

  it("never stacks a title tint over the open block tint", async () => {
    const user = userEvent.setup();
    render(
      <Collapsible title="Dynamique" display="outline-highlight" color="info">
        Texte
      </Collapsible>
    );

    const trigger = screen.getByRole("button", { name: "Dynamique" });
    expect(trigger.className).toContain("hover:bg-info/10");
    await user.click(trigger);
    expect(trigger.className).not.toContain("hover:bg-info/10");
  });
});
