// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TagsInput } from "./tags-input";

// The keyword field (issue #15) on Base UI's Combobox (issue #34): picking
// what already exists and typing a new word must both stay one keystroke
// away, and the list never takes the focus from the field.

function Harness({
  initial = [],
  candidates,
}: {
  initial?: string[];
  candidates: string[];
}) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagsInput
        ariaLabel="Mots-clés"
        tags={tags}
        candidates={candidates}
        onChange={setTags}
      />
      <output data-testid="tags">{tags.join("|")}</output>
    </>
  );
}

function setup(props: Parameters<typeof Harness>[0]) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  return {
    user,
    field: screen.getByRole("combobox", { name: "Mots-clés" }),
    tags: () => screen.getByTestId("tags").textContent,
    options: () =>
      within(screen.getByRole("listbox")).getAllByRole("option").map(
        (option) => option.textContent
      ),
  };
}

afterEach(cleanup);

describe("TagsInput", () => {
  it("opens on focus with the used values", async () => {
    const { user, field, options } = setup({ candidates: ["atelier", "sport"] });
    await user.click(field);
    expect(field).toHaveProperty("ariaExpanded", "true");
    expect(options()).toEqual(["atelier", "sport"]);
  });

  it("adds a new word with Enter, offered first as « Ajouter »", async () => {
    const { user, field, tags, options } = setup({ candidates: ["chaton"] });
    await user.click(field);
    await user.type(field, "chat");
    expect(options()).toEqual(["Ajouter « chat »", "chaton"]);
    await user.keyboard("{Enter}");
    expect(tags()).toBe("chat");
    expect(field).toHaveProperty("value", "");
  });

  it("adds an existing value with ArrowDown then Enter, and stays open", async () => {
    const { user, field, tags, options } = setup({
      candidates: ["chaton", "sport"],
    });
    await user.click(field);
    await user.type(field, "chat");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(tags()).toBe("chaton");
    expect(field).toHaveProperty("value", "");
    expect(options()).toEqual(["sport"]);
  });

  it("takes the spelling in use when the typed word already exists", async () => {
    const { user, field, tags, options } = setup({ candidates: ["Chaton"] });
    await user.click(field);
    await user.type(field, "chaton");
    expect(options()).toEqual(["Chaton"]);
    await user.keyboard("{Enter}");
    expect(tags()).toBe("Chaton");
  });

  it("adds a suggestion on click, and stays open", async () => {
    const { user, field, tags, options } = setup({
      candidates: ["atelier", "sport"],
    });
    await user.click(field);
    await user.click(screen.getByRole("option", { name: "sport" }));
    expect(tags()).toBe("sport");
    expect(options()).toEqual(["atelier"]);
    expect(document.activeElement).toBe(field);
  });

  it("adds the typed word with a comma, and on leaving the field", async () => {
    const { user, field, tags } = setup({ candidates: ["chaton"] });
    await user.click(field);
    await user.type(field, "chat,");
    expect(tags()).toBe("chat");
    await user.type(field, "chien");
    await user.tab();
    expect(tags()).toBe("chat|chien");
  });

  it("removes the last tag with Backspace on an empty field", async () => {
    const { user, field, tags } = setup({
      initial: ["atelier", "sport"],
      candidates: [],
    });
    await user.click(field);
    await user.keyboard("{Backspace}");
    expect(tags()).toBe("atelier");
  });

  it("removes a tag with its remove button", async () => {
    const { user, tags } = setup({
      initial: ["atelier", "sport"],
      candidates: [],
    });
    await user.click(screen.getByRole("button", { name: "Retirer le tag atelier" }));
    expect(tags()).toBe("sport");
  });

  it("never clears the draft nor the tags on Escape", async () => {
    const { user, field, tags } = setup({
      initial: ["atelier"],
      candidates: ["chaton"],
    });
    await user.click(field);
    await user.type(field, "cha");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Escape}");
    expect(field).toHaveProperty("value", "cha");
    expect(tags()).toBe("atelier");
  });

  it("adds the draft with Enter once Escape closed the list", async () => {
    const { user, field, tags } = setup({ candidates: ["chaton"] });
    await user.click(field);
    await user.type(field, "chat");
    await user.keyboard("{Escape}{Enter}");
    expect(tags()).toBe("chat");
  });

  it("names the highlighted option through aria-activedescendant", async () => {
    const { user, field } = setup({ candidates: ["chaton"] });
    await user.click(field);
    await user.type(field, "chat");
    const highlighted = screen.getByRole("option", { name: "Ajouter « chat »" });
    expect(field.getAttribute("aria-activedescendant")).toBe(highlighted.id);
    expect(field.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").id
    );
  });
});
