// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tab } from "./wiki-components/tab";
import { Tabs } from "./wiki-components/tabs";

function Example() {
  return (
    <Tabs>
      <Tab title="Premier">Un</Tab>
      <Tab title="Second">Deux</Tab>
    </Tabs>
  );
}

describe("<Tabs> anchors", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/page");
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it("opens an incoming anchor", async () => {
    window.history.replaceState(null, "", "/page#second");
    render(<Example />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Second" }).getAttribute("aria-selected")).toBe("true")
    );
  });

  it("replaces the hash when a tab is activated", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("tab", { name: "Second" }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/page#second");
  });
});
