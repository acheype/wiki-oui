// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickAccessSlot } from "./ui/quick-access-slot";
import { ThemeToggle } from "./ui/theme-toggle";
import { Menu } from "./wiki-components/menu";

const theme = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => theme,
}));

describe("<ThemeToggle>", () => {
  afterEach(() => {
    cleanup();
    theme.resolvedTheme = "light";
    theme.setTheme.mockReset();
  });

  it("switches to the dark theme without closing its menu", async () => {
    const user = userEvent.setup();
    render(
      <QuickAccessSlot>
        <Menu>
          <ul>
            <li>
              Configuration
              <ul>
                <li>Autre réglage</li>
              </ul>
            </li>
          </ul>
        </Menu>
      </QuickAccessSlot>
    );

    await user.click(screen.getByRole("button", { name: "Configuration" }));
    const toggle = screen.getByRole("switch", { name: "Thème sombre" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    await user.click(toggle);

    expect(theme.setTheme).toHaveBeenCalledWith("dark");
    expect(screen.getByText("Autre réglage")).toBeTruthy();
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("switches back to the light theme", async () => {
    theme.resolvedTheme = "dark";
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = await screen.findByRole("switch", { name: "Thème sombre" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);

    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });
});
