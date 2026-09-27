// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ButtonView } from "./ui/button-view";

describe("<ButtonView>", () => {
  afterEach(cleanup);

  it("uses the shadcn secondary and destructive variants", () => {
    const { rerender } = render(<ButtonView text="Secondaire" color="secondary" />);

    expect(screen.getByRole("button", { name: "Secondaire" }).className).toContain(
      "bg-secondary"
    );
    expect(screen.getByRole("button", { name: "Secondaire" }).className).not.toContain(
      "bg-secondary-foreground"
    );

    rerender(<ButtonView text="Destructif" color="destructive" />);
    const destructive = screen.getByRole("button", { name: "Destructif" });
    expect(destructive.className).toContain("text-destructive");
  });
});
