// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Field } from "./field-widget";

afterEach(cleanup);

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

describe("<Field> for a Date / heure", () => {
  const spec = { type: "datetime", label: "Quand", optionalTime: true } as const;

  it("offers a time and an unchecked « Toute la journée » by default", () => {
    render(<Field id="quand" spec={spec} value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Heure" })).toBeTruthy();
    const allDay = screen.getByRole("checkbox", { name: "Toute la journée" });
    expect(allDay.getAttribute("aria-checked")).toBe("false");
  });

  it("drops the time and hides it when « Toute la journée » is checked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field id="quand" spec={spec} value="2026-11-03T18:30" onChange={onChange} />
    );

    await user.click(screen.getByRole("checkbox", { name: "Toute la journée" }));

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03");
    expect(screen.queryByRole("textbox", { name: "Heure" })).toBeNull();
  });

  it("reads a stored date alone as « Toute la journée »", () => {
    render(<Field id="quand" spec={spec} value="2026-11-03" onChange={vi.fn()} />);

    const allDay = screen.getByRole("checkbox", { name: "Toute la journée" });
    expect(allDay.getAttribute("aria-checked")).toBe("true");
  });

  it("takes a time typed on the keyboard, to the minute", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.type(screen.getByRole("textbox", { name: "Heure" }), "18:20");

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:20");
  });

  it("takes a time picked in the hour and minute columns", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Choisir l'heure" }));
    await user.click(await screen.findByRole("option", { name: "18" }));
    await user.click(screen.getByRole("option", { name: "30" }));

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:30");
  });

  it("waits for a time while « Toute la journée » is unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-05T" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /^Date/ }));
    await user.click(await screen.findByRole("button", { name: /\b3 novembre 2026$/ }));

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T");
  });

  it("offers neither a time nor the box in Date mode", () => {
    render(
      <Field id="quand" spec={{ ...spec, format: "date" }} value="" onChange={vi.fn()} />
    );

    expect(screen.queryByRole("textbox", { name: "Heure" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Toute la journée" })).toBeNull();
  });

  it("offers no box when the time is required", () => {
    render(
      <Field id="quand" spec={{ ...spec, optionalTime: false }} value="" onChange={vi.fn()} />
    );

    expect(screen.getByRole("textbox", { name: "Heure" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Toute la journée" })).toBeNull();
  });
});

describe("<Field> for a Période", () => {
  const spec = { type: "datetimeRange", label: "Dates", format: "date" } as const;

  it("copies a picked start into an empty end", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={spec}
        value={{ start: "2026-11-01", end: "" }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Date de début/ }));
    await user.click(await screen.findByRole("button", { name: /\b3 novembre 2026$/ }));

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03",
      end: "2026-11-03",
    });
  });

  it("greys the end days before the start", async () => {
    const user = userEvent.setup();
    render(
      <Field
        id="dates"
        spec={spec}
        value={{ start: "2026-11-10", end: "2026-11-12" }}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Date de fin/ }));

    const before = await screen.findByRole("button", { name: /\b9 novembre 2026$/ });
    expect(before.hasAttribute("disabled")).toBe(true);
  });

  it("clears to no value when both bounds are emptied", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "time" }}
        value={{ start: "09:00", end: "" }}
        onChange={onChange}
      />
    );

    await user.clear(screen.getByRole("textbox", { name: "Heure de début" }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

