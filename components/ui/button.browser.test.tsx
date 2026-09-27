import "@/app/globals.css";
import { render } from "vitest-browser-react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

function compositeRelativeLuminance(color: string, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;

  context.fillStyle = background;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);

  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  const linearChannels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (
    0.2126 * linearChannels[0] +
    0.7152 * linearChannels[1] +
    0.0722 * linearChannels[2]
  );
}

describe("<Button> hover colors (browser)", () => {
  it("lightens the secondary color on hover", async () => {
    const screen = await render(<Button variant="secondary">Secondaire</Button>);
    const button = screen.getByRole("button", { name: "Secondaire" });
    const background = getComputedStyle(document.body).backgroundColor;
    const restingLuminance = compositeRelativeLuminance(
      getComputedStyle(button.element()).backgroundColor,
      background
    );

    await button.hover();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const hoveredLuminance = compositeRelativeLuminance(
      getComputedStyle(button.element()).backgroundColor,
      background
    );
    expect(hoveredLuminance).toBeGreaterThan(restingLuminance);
  });
});
