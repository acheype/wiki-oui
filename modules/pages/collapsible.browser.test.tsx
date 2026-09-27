import "@/app/globals.css";
import { render } from "vitest-browser-react";
import { describe, expect, it } from "vitest";
import { Accordion } from "./wiki-components/accordion";
import { Collapsible } from "./wiki-components/collapsible";

function separators() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-slot='collapsible-separator']")
  );
}

describe("<Accordion> separators and highlight (browser)", () => {
  it("keeps separators inset while every row is idle", async () => {
    await render(
      <Accordion display="separators-highlight" color="info">
        <Collapsible title="Un">Premier contenu</Collapsible>
        <Collapsible title="Deux">Deuxième contenu</Collapsible>
      </Accordion>
    );

    for (const separator of separators()) {
      expect(getComputedStyle(separator).marginLeft).toBe("16px");
    }
  });

  it("extends both shared separators around an open row", async () => {
    await render(
      <Accordion
        display="separators-highlight"
        color="info"
        default="deux"
      >
        <Collapsible title="Un">Premier contenu</Collapsible>
        <Collapsible title="Deux">Deuxième contenu</Collapsible>
      </Accordion>
    );

    for (const separator of separators()) {
      expect(getComputedStyle(separator).marginLeft).toBe("0px");
    }
  });

  it("extends both shared separators around a hovered row", async () => {
    const screen = await render(
      <Accordion display="separators-highlight" color="info">
        <Collapsible title="Un">Premier contenu</Collapsible>
        <Collapsible title="Deux">Deuxième contenu</Collapsible>
      </Accordion>
    );

    await screen.getByRole("button", { name: "Deux" }).hover();
    for (const separator of separators()) {
      expect(getComputedStyle(separator).marginLeft).toBe("0px");
    }
  });
});
