// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prose } from "@/components/ui/prose";
import { Menu } from "./wiki-components/menu";

const { route } = vi.hoisted(() => ({
  route: { pathname: "/trombi-annuaire" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

function FakeLink({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & { href: string }) {
  return <a {...props}>{children}</a>;
}

function DirectoryMenu() {
  return (
    <Prose>
      <Menu>
        <ul>
          <li>
            <FakeLink href="trombi-annuaire">Trombinoscope</FakeLink>
          </li>
          <li>
            <FakeLink href="annuaire-alpha">Annuaire alphabétique</FakeLink>
          </li>
          <li>
            <FakeLink href="carto-annuaire">Annuaire cartographique</FakeLink>
          </li>
        </ul>
      </Menu>
    </Prose>
  );
}

function rect(left: number, width: number): DOMRect {
  return {
    bottom: 32,
    height: 32,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

describe("an authored <Menu> inside page content", () => {
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    route.pathname = "/trombi-annuaire";
    frames.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.slot === "menu-root-item") {
          const items = Array.from(
            this.parentElement?.querySelectorAll(
              '[data-slot="menu-root-item"]'
            ) ?? []
          );
          return rect(items.indexOf(this) * 160, 140);
        }
        return rect(0, 480);
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opts out of prose link decoration", () => {
    const { container } = render(<DirectoryMenu />);

    expect(container.querySelector("nav")?.className).toContain("not-prose");
  });

  it("keeps the previous marker position across a page remount", () => {
    const first = render(<DirectoryMenu />);
    expect(
      first.container.querySelector<HTMLElement>(
        '[data-slot="active-underline"]'
      )?.style.translate
    ).toBe("0px 30px");
    first.unmount();

    route.pathname = "/annuaire-alpha";
    const second = render(<DirectoryMenu />);
    const marker = second.container.querySelector<HTMLElement>(
      '[data-slot="active-underline"]'
    );

    expect(marker?.style.translate).toBe("0px 30px");
    act(() => frames.splice(0).forEach((frame) => frame(0)));
    expect(marker?.style.translate).toBe("160px 30px");
  });
});
