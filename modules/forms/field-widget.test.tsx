// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Field } from "./field-widget";

describe("<Field>", () => {
  it("separates a checkbox field label from its control label", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Field
        id="default-open"
        spec={{
          label: "Affichage initial",
          checkboxLabel: "Déplié par défaut",
          type: "checkbox",
        }}
        value={false}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Affichage initial").tagName).toBe("LEGEND");
    const checkbox = screen.getByRole("checkbox", {
      name: "Déplié par défaut",
    });

    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
