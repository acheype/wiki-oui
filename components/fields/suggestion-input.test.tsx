// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SuggestionInput } from "./suggestion-input";

// The single-value field (page-list, file-list) on Base UI's Autocomplete
// (issue #34): the closest suggestion is one Enter away, and whatever is
// typed stays the value until a suggestion is picked.

function Harness({
  initial = "",
  candidates,
}: {
  initial?: string;
  candidates: string[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="page">Page</label>
      <SuggestionInput
        id="page"
        value={value}
        placeholder="ma-page"
        candidates={candidates}
        onChange={setValue}
      />
      <output data-testid="value">{value}</output>
      {/* Where Tab lands, as on a real form: Base UI closes the list only
          when the focus moves onto another element. */}
      <button type="button">Suivant</button>
    </>
  );
}

function setup(props: Parameters<typeof Harness>[0]) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  return {
    user,
    field: screen.getByRole("combobox", { name: "Page" }),
    value: () => screen.getByTestId("value").textContent,
    options: () =>
      within(screen.getByRole("listbox")).getAllByRole("option").map(
        (option) => option.textContent
      ),
  };
}

afterEach(cleanup);

describe("SuggestionInput", () => {
  it("opens on focus with the candidates", async () => {
    const { user, field, options } = setup({ candidates: ["accueil", "aide"] });
    await user.click(field);
    expect(options()).toEqual(["accueil", "aide"]);
  });

  it("takes the closest suggestion with Enter, and closes", async () => {
    const { user, field, value } = setup({
      candidates: ["chat-perdu", "perroquet"],
    });
    await user.click(field);
    await user.type(field, "per");
    expect(field).toHaveProperty("value", "per");
    await user.keyboard("{Enter}");
    expect(value()).toBe("perroquet");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps an existing value typed in full on Enter", async () => {
    const { user, field, value } = setup({ candidates: ["chaton-2", "chaton"] });
    await user.click(field);
    await user.type(field, "chaton{Enter}");
    expect(value()).toBe("chaton");
  });

  it("keeps free text nothing matches, such as an address", async () => {
    const { user, field, value } = setup({ candidates: ["accueil"] });
    await user.click(field);
    await user.type(field, "https://exemple.org{Enter}");
    expect(value()).toBe("https://exemple.org");
  });

  it("keeps the typed text on leaving the field, never the highlighted suggestion", async () => {
    const { user, field, value } = setup({
      candidates: ["chat-perdu", "perroquet"],
    });
    await user.click(field);
    await user.type(field, "per");
    await user.tab();
    expect(value()).toBe("per");
    expect(field).toHaveProperty("value", "per");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("takes another suggestion with ArrowDown then Enter", async () => {
    const { user, field, value } = setup({
      candidates: ["chat-perdu", "chaton"],
    });
    await user.click(field);
    await user.type(field, "chat");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(value()).toBe("chaton");
  });

  it("takes a suggestion on click", async () => {
    const { user, field, value } = setup({ candidates: ["accueil", "aide"] });
    await user.click(field);
    await user.click(screen.getByRole("option", { name: "aide" }));
    expect(value()).toBe("aide");
    expect(document.activeElement).toBe(field);
  });

  it("stays open on the candidates when the field is emptied", async () => {
    const { user, field, options } = setup({ candidates: ["accueil", "aide"] });
    await user.click(field);
    await user.type(field, "acc");
    await user.clear(field);
    expect(options()).toEqual(["accueil", "aide"]);
  });

  it("never clears the value on Escape", async () => {
    const { user, field, value } = setup({ candidates: ["accueil"] });
    await user.click(field);
    await user.type(field, "acc");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Escape}");
    expect(value()).toBe("acc");
    expect(field).toHaveProperty("value", "acc");
  });

  it("names the highlighted option through aria-activedescendant", async () => {
    const { user, field } = setup({ candidates: ["accueil"] });
    await user.click(field);
    await user.type(field, "acc");
    const highlighted = screen.getByRole("option", { name: "accueil" });
    expect(field.getAttribute("aria-activedescendant")).toBe(highlighted.id);
    expect(field.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").id
    );
  });

  it("marks the highlighted option, and only it, as selected", async () => {
    const { user, field } = setup({ candidates: ["chat-perdu", "chaton"] });
    await user.click(field);
    await user.type(field, "chat");
    await user.keyboard("{ArrowDown}");
    const selected = screen
      .getAllByRole("option")
      .map((option) => [option.textContent, option.getAttribute("aria-selected")]);
    expect(selected).toEqual([
      ["chat-perdu", "false"],
      ["chaton", "true"],
    ]);
  });
});
