import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SuggestionInput } from "./suggestion-input";

// Leaving the field keeps the typed text, never the highlighted suggestion.
// This is the real-focus case of ADR 0032: under jsdom the same behaviour
// (suggestion-input.test.tsx) needed a fake Tab target because relatedTarget
// came back null; a real browser moves focus for real, so the list closes on
// a genuine blur without staging the DOM around jsdom's limits.

function Harness({ candidates }: { candidates: string[] }) {
  const [value, setValue] = useState("");
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
      <button type="button">Suivant</button>
    </>
  );
}

describe("SuggestionInput (browser)", () => {
  it("keeps the typed text and closes the list when focus really leaves", async () => {
    const screen = await render(
      <Harness candidates={["chat-perdu", "perroquet"]} />
    );
    const field = screen.getByRole("combobox", { name: "Page" });
    await field.click();
    await field.fill("per");
    await userEvent.tab();
    await expect.element(screen.getByTestId("value")).toHaveTextContent("per");
    await expect.element(field).toHaveValue("per");
    expect(screen.getByRole("listbox").query()).toBeNull();
  });
});
