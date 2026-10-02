// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentBuilderSpec } from "../descriptors";
import { descriptorDefaults, type ComponentDescriptor } from "../descriptor";
import {
  ComponentBuilderDialog,
  insertionState,
} from "./component-builder";

const descriptor: ComponentDescriptor = {
  label: "Accordéon",
  properties: {
    headingLevel: {
      label: "Niveau de titre",
      type: "list",
      default: "none",
      advanced: true,
      options: { none: "Aucun", h2: "Titre 2" },
    },
  },
  children: {
    component: "Collapsible",
    label: "Bloc",
    anchorField: "title",
    collectionLabel: "Blocs dépliables",
    selection: { prop: "default", initial: "none" },
    singleChildWarning:
      "Cet accordéon ne contient qu'un bloc. Utilisez plutôt un bloc dépliable seul.",
    initialContent: "Contenu du bloc dépliable à modifier",
    properties: {
      title: {
        label: "Titre",
        type: "text",
        initialValue: "Titre de mon bloc",
        required: true,
      },
    },
  },
};

const spec: ComponentBuilderSpec = {
  module: "pages",
  base: "accordion",
  name: "Accordion",
  descriptor,
  defaults: descriptorDefaults(descriptor),
};

describe("managed-child ComponentBuilder", () => {
  afterEach(cleanup);

  it("keeps child editing without a selection control when selection is absent", () => {
    const withoutSelection = {
      ...spec,
      descriptor: {
        ...descriptor,
        children: { ...descriptor.children!, selection: undefined },
      },
    };
    render(
      <ComponentBuilderDialog
        open
        onOpenChange={vi.fn()}
        state={{ mode: "insert", spec: withoutSelection, initial: insertionState(withoutSelection) }}
        allSlugs={[]}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Bloc ouvert au chargement")).toBeNull();
    expect(screen.queryByText("Ouvert au départ")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ajouter un élément" })).toBeTruthy();
  });

  it("offers no initial block, numbers additions, and blocks an empty wrapper", async () => {
    const user = userEvent.setup();
    render(
      <ComponentBuilderDialog
        open
        onOpenChange={vi.fn()}
        state={{ mode: "insert", spec, initial: insertionState(spec) }}
        allSlugs={[]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Bloc ouvert au chargement")).toBeTruthy();
    expect(
      screen.getByText(
        "Choisissez le bloc qui sera déjà ouvert quand la page s’affiche."
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Aucun bloc ouvert" })
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Titre de mon bloc 1" })
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Titre de mon bloc 2" })
    ).toBeTruthy();
    expect(screen.queryByText("Par défaut")).toBeNull();
    expect(screen.queryByText("Ouvert au départ")).toBeNull();
    await user.click(
      screen.getByRole("radio", { name: "Titre de mon bloc 1" })
    );
    expect(screen.getByText("Ouvert au départ")).toBeTruthy();
    expect(screen.queryByText("Niveau de titre")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Paramètres avancés" }));
    expect(screen.getByText("Niveau de titre")).toBeTruthy();
    expect(screen.getAllByRole("textbox").map((input) => input.getAttribute("value"))).toEqual([
      "Titre de mon bloc 1",
      "Titre de mon bloc 2",
    ]);

    await user.click(screen.getAllByRole("button", { name: "Supprimer : Bloc" })[0]);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(
      screen.getByText(
        "Cet accordéon ne contient qu'un bloc. Utilisez plutôt un bloc dépliable seul."
      )
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ajouter un élément" }));
    expect(screen.getAllByRole("textbox").map((input) => input.getAttribute("value"))).toEqual([
      "Titre de mon bloc 2",
      "Titre de mon bloc 1",
    ]);

    await user.click(screen.getAllByRole("button", { name: "Supprimer : Bloc" })[0]);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getAllByRole("button", { name: "Supprimer : Bloc" })[0]);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.getByRole("button", { name: "Insérer" }).hasAttribute("disabled")).toBe(true);
  });
});
