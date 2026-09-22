// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement, lazy, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { WIKI_COMPONENT_NAME_PROPERTY } from "@/modules/authoring/wiki-component";
import { Accordion } from "./wiki-components/accordion";
import { Tabs } from "./wiki-components/tabs";

// A client component crossing RSC reaches its client parent with an object as
// its element type, not the function object imported by that parent. The
// registry therefore transports the stable component name as a serializable
// prop; this lazy element reproduces that boundary shape in the fast unit
// suite without starting Next.
const BoundaryComponent = lazy(async () => ({
  default: (props: Record<string, unknown>) => {
    void props;
    return null;
  },
}));

function transportedChild(
  component: "Collapsible" | "Tab",
  title: string,
  content: string
): ReactElement {
  return createElement(
    BoundaryComponent,
    { [WIKI_COMPONENT_NAME_PROPERTY]: component, title },
    content
  );
}

describe("wiki component identity across the RSC boundary", () => {
  afterEach(cleanup);

  it("keeps a transported Collapsible inside Accordion", () => {
    render(
      <Accordion>
        {transportedChild("Collapsible", "Bloc transporté", "Contenu")}
      </Accordion>
    );

    expect(screen.getByRole("button", { name: "Bloc transporté" })).toBeTruthy();
  });

  it("keeps a transported Tab inside Tabs", () => {
    render(
      <Tabs>{transportedChild("Tab", "Onglet transporté", "Contenu")}</Tabs>
    );

    expect(screen.getByRole("tab", { name: "Onglet transporté" })).toBeTruthy();
  });

  it("does not mistake another transported component for a managed child", () => {
    const { container } = render(
      <Accordion>{transportedChild("Tab", "Intrus", "Contenu")}</Accordion>
    );

    expect(container.querySelector("[data-slot='accordion']")).toBeNull();
  });
});
