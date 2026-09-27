// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Accordion } from "./wiki-components/accordion";
import { Collapsible } from "./wiki-components/collapsible";

function Example({ default: defaultSlug }: { default?: string }) {
  return (
    <Accordion default={defaultSlug}>
      <Collapsible title="Premier">Contenu un</Collapsible>
      <Collapsible title="Second">Contenu deux</Collapsible>
    </Accordion>
  );
}

describe("<Accordion>", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/page");
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it("starts with no block open and permits returning to that state", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const first = screen.getByRole("button", { name: "Premier" });
    const second = screen.getByRole("button", { name: "Second" });

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    await user.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    await user.click(second);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    await user.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the configured default block", () => {
    render(<Example default="second" />);
    expect(screen.getByRole("button", { name: "Premier" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Second" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("opens an incoming anchor and replaces then removes its hash", async () => {
    window.history.replaceState(null, "", "/page#second");
    const replace = vi.spyOn(window.history, "replaceState");
    const user = userEvent.setup();
    render(<Example />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Second" }).getAttribute("aria-expanded")).toBe("true")
    );
    await user.click(screen.getByRole("button", { name: "Premier" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/page#premier");
    await user.click(screen.getByRole("button", { name: "Premier" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/page");
  });

  it("lets the parent dominate child presentation and initial state", () => {
    const { container } = render(
      <Accordion display="outline" color="success" headingLevel="h3" toggleIcon="plus-minus">
        <Collapsible
          title="Dominé"
          defaultOpen
          display="highlight"
          color="destructive"
          headingLevel="h5"
          toggleIcon="chevron"
        >
          Texte
        </Collapsible>
      </Accordion>
    );

    const trigger = screen.getByRole("button", { name: "Dominé" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("heading", { level: 3, name: "Dominé" })).toBeTruthy();
    expect(container.querySelector(".lucide-plus")).toBeTruthy();
    const block = trigger.closest("[data-slot='collapsible']") as HTMLElement;
    expect(block.className).toContain("border-success");
    expect(block.className).not.toContain("bg-destructive-subtle");
  });

  it("ignores direct content outside Collapsible children", () => {
    render(
      <Accordion>
        Texte ignoré
        <Collapsible title="Valide">Contenu gardé</Collapsible>
        <span title="Intrus">Élément ignoré</span>
      </Accordion>
    );

    expect(screen.queryByText("Texte ignoré")).toBeNull();
    expect(screen.queryByText("Élément ignoré")).toBeNull();
    expect(screen.queryByRole("button", { name: "Intrus" })).toBeNull();
    expect(screen.getByText("Contenu gardé")).toBeTruthy();
  });

  it.each([
    ["outline", "joined", "border-info"],
    ["outline", "separated", "gap-3"],
    ["outline-tinted", "joined", "bg-info-subtle"],
    ["outline-tinted", "separated", "gap-3"],
    ["outline-highlight", "joined", "data-open:bg-info-subtle"],
    ["outline-highlight", "separated", "gap-3"],
    ["highlight", "separated", "gap-3"],
    ["separators", "joined", "border-border"],
    ["separators-highlight", "joined", "data-open:bg-info-subtle"],
  ] as const)(
    "renders the admitted %s with %s spacing combination",
    (display, spacing, expectedClass) => {
      const { container } = render(
        <Accordion display={display} spacing={spacing} color="info">
          <Collapsible title="Un">Un</Collapsible>
          <Collapsible title="Deux">Deux</Collapsible>
        </Accordion>
      );

      expect(container.innerHTML).toContain(expectedClass);
      expect(container.innerHTML).toContain("print:block!");
    }
  );

  it.each([
    ["highlight", "joined", "gap-3", "border-border"],
    ["separators", "separated", "border-border", "gap-3"],
    ["separators-highlight", "separated", "border-border", "gap-3"],
  ] as const)(
    "canonically resolves unsupported %s with %s spacing",
    (display, spacing, expectedClass, absentClass) => {
      const { container } = render(
        <Accordion display={display} spacing={spacing} color="info">
          <Collapsible title="Un">Un</Collapsible>
          <Collapsible title="Deux">Deux</Collapsible>
        </Accordion>
      );

      const root = container.querySelector("[data-slot='accordion']");
      expect(container.innerHTML).toContain(expectedClass);
      expect(root?.className).not.toContain(absentClass);
    }
  );

  it("renders straight separators with dark icons and black titles", () => {
    const { container } = render(
      <Accordion toggleIcon="plus-minus">
        <Collapsible title="Avec icône" icon="lucide:info">
          Texte
        </Collapsible>
        <Collapsible title="Autre">Texte</Collapsible>
      </Accordion>
    );

    const trigger = screen.getByRole("button", { name: "Avec icône" });
    const block = trigger.closest("[data-slot='collapsible']") as HTMLElement;
    expect(block.className).toContain("rounded-none");
    expect(block.className).not.toContain("rounded-lg");
    expect(trigger.querySelector(".text-foreground")?.textContent).toBe("Avec icône");
    expect(trigger.querySelector(".lucide-plus")?.getAttribute("class")).toContain(
      "text-muted-foreground/60"
    );
    expect(trigger.querySelector(".text-xl")?.getAttribute("class")).toContain(
      "text-muted-foreground/60"
    );
    const separators = container.querySelectorAll(
      "[data-slot='collapsible-separator']"
    );
    expect(separators).toHaveLength(2);
    expect(separators[0]?.className).toContain("mx-4");
    expect(separators[0]?.className).toContain("border-border");
    expect(container.querySelector("[data-slot='accordion']")?.className).not.toContain(
      "divide-y"
    );
  });

  it("highlights separator rows on hover and while open", () => {
    render(
      <Accordion display="separators-highlight" color="info" default="un">
        <Collapsible title="Un">Un</Collapsible>
        <Collapsible title="Deux">Deux</Collapsible>
      </Accordion>
    );

    const openTrigger = screen.getByRole("button", { name: "Un" });
    const closedTrigger = screen.getByRole("button", { name: "Deux" });
    expect(
      openTrigger.closest("[data-slot='collapsible']")?.className
    ).toContain("data-open:bg-info-subtle");
    expect(openTrigger.className).not.toContain("hover:bg-info-subtle");
    expect(closedTrigger.className).toContain("hover:bg-info-subtle");
    const openBlock = openTrigger.closest("[data-slot='collapsible']") as HTMLElement;
    const openEnd = openBlock.querySelector(
      "[data-slot='collapsible-separator']"
    ) as HTMLElement;
    const closedEnd = closedTrigger
      .closest("[data-slot='collapsible']")
      ?.querySelector("[data-slot='collapsible-separator']") as HTMLElement;
    expect(openBlock.className).toContain(
      "shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)]"
    );
    expect(openEnd.className).toContain("mx-0");
    expect(closedEnd.className).toContain("mx-4");
    expect(openEnd.className).toContain("border-border");
    expect(openEnd.className).not.toContain("border-info");
    expect(openBlock.className).not.toContain("border-info");
  });
});
