// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Field, type FieldValue } from "./field-widget";

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

    expect(screen.getByRole("group", { name: "Heure" })).toBeTruthy();
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
    expect(screen.queryByRole("group", { name: "Heure" })).toBeNull();
  });

  it("reads a stored date alone as « Toute la journée »", () => {
    render(<Field id="quand" spec={spec} value="2026-11-03" onChange={vi.fn()} />);

    const allDay = screen.getByRole("checkbox", { name: "Toute la journée" });
    expect(allDay.getAttribute("aria-checked")).toBe("true");
  });

  const segment = (group: string, name: "Heures" | "Minutes") =>
    within(screen.getByRole("group", { name: group })).getByRole("combobox", {
      name,
    });

  it("takes a time typed on the keyboard, to the minute", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(segment("Heure", "Heures"));
    await user.keyboard("1820");

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:20");
  });

  it("fills the minutes with 00 once the hour is entered", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(segment("Heure", "Heures"));
    await user.keyboard("18");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:00");

    await user.keyboard("30");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:30");
  });

  it("fills the minutes with 00 once an hour is picked in the menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(segment("Heure", "Heures"));
    await user.click(screen.getByRole("option", { name: "18" }));

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:00");
  });

  it("moves to the minutes once the hour is complete", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(segment("Heure", "Heures"));
    await user.keyboard("9");

    expect(document.activeElement).toBe(segment("Heure", "Minutes"));
    await user.keyboard("15");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T09:15");
  });

  it("opens the hours under the hour, the quarter hours under the minutes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Field id="quand" spec={spec} value="2026-11-03T" onChange={onChange} />);

    await user.click(segment("Heure", "Heures"));
    expect(screen.getAllByRole("option")).toHaveLength(24);
    await user.click(screen.getByRole("option", { name: "18" }));

    expect(document.activeElement).toBe(segment("Heure", "Minutes"));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["00", "15", "30", "45"]);
    await user.click(screen.getByRole("option", { name: "30" }));

    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T18:30");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("steps an hour, or a quarter hour, with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field id="quand" spec={spec} value="2026-11-03T23:20" onChange={onChange} />
    );

    await user.click(segment("Heure", "Minutes"));
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T23:30");

    await user.click(segment("Heure", "Heures"));
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-03T00:30");
  });

  it("uses the device's own time picker on a touch screen", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      render(
        <Field id="quand" spec={spec} value="2026-11-03T18:30" onChange={vi.fn()} />
      );
      const input = screen.getByLabelText("Heure") as HTMLInputElement;
      expect(input.type).toBe("time");
      expect(input.value).toBe("18:30");
    } finally {
      window.matchMedia = matchMedia;
    }
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

    expect(screen.queryByRole("group", { name: "Heure" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Toute la journée" })).toBeNull();
  });

  it("offers no box when the time is required", () => {
    render(
      <Field id="quand" spec={{ ...spec, optionalTime: false }} value="" onChange={vi.fn()} />
    );

    expect(screen.getByRole("group", { name: "Heure" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Toute la journée" })).toBeNull();
  });
});

describe("<Field> for a Période", () => {
  const spec = { type: "datetimeRange", label: "Dates", format: "date" } as const;

  const day = (number: number) =>
    screen.findByRole("button", { name: new RegExp(` ${number} novembre 2026`) });

  it("puts « Toute la journée » and « Sur plusieurs jours » above the date", () => {
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={undefined}
        onChange={vi.fn()}
      />
    );

    const date = screen.getByRole("button", { name: /^Date/ });
    for (const name of ["Toute la journée", "Sur plusieurs jours"]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("enters a one-day period with a single date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-01T18:00", end: "2026-11-01T19:00" }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Date/ }));
    await user.click(await day(3));

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T18:00",
      end: "2026-11-03T19:00",
    });
  });

  it("ends an hour after a start time typed with no end time yet", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-03T", end: "2026-11-03T" }}
        onChange={onChange}
      />
    );

    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.click(start.getByRole("combobox", { name: "Heures" }));
    await user.keyboard("1830");

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T18:30",
      end: "2026-11-03T19:30",
    });
  });

  // The entry form feeds each change back as the new value: so does this one.
  function Controlled({
    initial,
    onChange,
  }: {
    initial: FieldValue;
    onChange: (value: FieldValue) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  it("keeps the end an hour after a start time typed digit by digit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled
        initial={{ start: "2026-11-03T", end: "2026-11-03T" }}
        onChange={onChange}
      />
    );

    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.click(start.getByRole("combobox", { name: "Heures" }));
    await user.keyboard("1830");

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T18:30",
      end: "2026-11-03T19:30",
    });
  });

  it("takes times before any date, over several days, without a stray day", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={undefined} onChange={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Sur plusieurs jours" }));
    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.click(start.getByRole("combobox", { name: "Heures" }));
    await user.keyboard("1");
    expect(screen.queryByText(/^le /)).toBeNull();
    await user.keyboard("8");
    expect(screen.queryByText(/^le /)).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Dates/ }));
    expect(await screen.findByRole("grid")).toBeTruthy();
  });

  it("greys earlier end hours when several days come down to one", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        initial={{ start: "2026-11-03T18:00", end: "2026-11-05T20:00" }}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Dates/ }));
    await user.click(await day(3));
    await user.click(await day(3));
    const end = within(screen.getByRole("group", { name: "Heure de fin" }));
    await user.click(end.getByRole("combobox", { name: "Heures" }));

    expect(
      screen.getByRole("option", { name: /^17/ }).getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("moves the end with the start, keeping the duration", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Controlled
        initial={{ start: "2026-11-03T18:00", end: "2026-11-03T20:00" }}
        onChange={onChange}
      />
    );

    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.click(start.getByRole("combobox", { name: "Heures" }));
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T17:00",
      end: "2026-11-03T19:00",
    });
  });

  it("carries the end along, keeping the duration, when the start passes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-03T18:00", end: "2026-11-03T19:30" }}
        onChange={onChange}
      />
    );

    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.click(start.getByRole("combobox", { name: "Heures" }));
    await user.keyboard("20");

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T20:00",
      end: "2026-11-03T21:30",
    });
  });

  it("opens a stored period over several days in its own mode", () => {
    render(
      <Field
        id="dates"
        spec={spec}
        value={{ start: "2026-11-03", end: "2026-11-05" }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("checkbox", { name: "Sur plusieurs jours" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(screen.getByRole("button", { name: /^Dates, du 3 au 5 novembre 2026/ })).toBeTruthy();
  });

  it("writes « de … le 1er novembre à … le 5 novembre » over several days", () => {
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-01T18:00", end: "2026-11-05T12:00" }}
        onChange={vi.fn()}
      />
    );

    for (const text of ["de", "le 1er novembre", "à", "le 5 novembre"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("Début")).toBeNull();
    expect(screen.queryByText("Fin")).toBeNull();
  });

  it("moves a period with one click, keeping its length", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={spec}
        value={{ start: "2026-11-10", end: "2026-11-12" }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Dates/ }));
    await user.click(await day(24));

    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-11-24", end: "2026-11-26" });
  });

  it("sets the end with a second click, never before the start", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={spec}
        value={{ start: "2026-11-10", end: "2026-11-12" }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Dates/ }));
    await user.click(await day(24));
    expect((await day(20)).hasAttribute("disabled")).toBe(true);
    await user.click(await day(28));

    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-11-24", end: "2026-11-28" });
  });

  it("brings the end back to the start's day when « Sur plusieurs jours » is unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-03T18:00", end: "2026-11-05T12:00" }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Sur plusieurs jours" }));

    expect(onChange).toHaveBeenLastCalledWith({
      start: "2026-11-03T18:00",
      end: "2026-11-03T19:00",
    });
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

    const start = within(screen.getByRole("group", { name: "Heure de début" }));
    await user.clear(start.getByRole("combobox", { name: "Heures" }));
    await user.clear(start.getByRole("combobox", { name: "Minutes" }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("shows the duration from the start, and greys earlier hours, in the end", async () => {
    const user = userEvent.setup();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-03T18:00", end: "2026-11-03T" }}
        onChange={vi.fn()}
      />
    );

    const end = within(screen.getByRole("group", { name: "Heure de fin" }));
    await user.click(end.getByRole("combobox", { name: "Heures" }));

    expect(screen.getByRole("option", { name: /^19/ }).textContent).toBe("191h");
    expect(
      screen.getByRole("option", { name: /^17/ }).getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("opens the end's hours on the first one still possible", async () => {
    const user = userEvent.setup();
    render(
      <Field
        id="dates"
        spec={{ ...spec, format: "datetime" }}
        value={{ start: "2026-11-03T18:30", end: "2026-11-03T" }}
        onChange={vi.fn()}
      />
    );

    const end = within(screen.getByRole("group", { name: "Heure de fin" }));
    await user.click(end.getByRole("combobox", { name: "Heures" }));

    expect(screen.getByRole("listbox").getAttribute("data-opened-on")).toBe("18");
  });
});

