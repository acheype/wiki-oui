import { describe, expect, it } from "vitest";
import { renderMdx } from "./mdx";
import { renderToStaticMarkup } from "react-dom/server";

// The sandbox's attribute rule (ADR 0002): a static literal prop reaches the
// component, anything evaluable never does. <Image> is the probe — its
// width/height reach the resize API as ?w=&h=, so the rendered src states
// exactly which props survived.

const IMAGE = "probe.png";

async function render(source: string): Promise<string> {
  return renderToStaticMarkup(await renderMdx(source) as React.ReactElement);
}

describe("literal props survive the sandbox", () => {
  it("passes a number", async () => {
    expect(await render(`<Image file="${IMAGE}" width={400} />`)).toContain(
      "?w=400"
    );
  });

  it("passes a negative number and a float", async () => {
    // -1 parses as a unary expression, not a single literal token.
    const html = await render(`<Image file="${IMAGE}" width={-1} height={2} />`);
    expect(html).toContain("h=2");
  });

  it("passes a boolean, which the blunt filter used to drop", async () => {
    // whiteBorder={true} adds border-8; the class proves the prop arrived.
    const html = await render(`<Image file="${IMAGE}" whiteBorder={true} />`);
    expect(html).toContain("border-8");
  });

  it("passes a quoted string expression", async () => {
    expect(await render(`<Image file={"${IMAGE}"} width={400} />`)).toContain(
      "?w=400"
    );
  });
});

describe("evaluable props are refused", () => {
  // The attribute must be *dropped*, not crash the compile: asserting the
  // image still renders is what separates "our allowlist refused it" from
  // "something blew up", which would satisfy a bare not.toContain().
  async function expectPropDropped(source: string) {
    const html = await render(source);
    expect(html).toContain(`src="/api/files/${IMAGE}"`);
    expect(html).not.toContain("?w=");
    return html;
  }

  it("refuses an identifier", async () => {
    await expectPropDropped(`<Image file="${IMAGE}" width={someVar} />`);
  });

  it("refuses a function call", async () => {
    await expectPropDropped(`<Image file="${IMAGE}" width={alert(1)} />`);
  });

  it("refuses member access reaching for a global", async () => {
    await expectPropDropped(
      `<Image file="${IMAGE}" width={process.env.SECRET} />`
    );
  });

  it("refuses the Function-constructor path", async () => {
    await expectPropDropped(
      `<Image file="${IMAGE}" width={[].constructor.constructor("return 1")()} />`
    );
  });

  it("refuses a template literal with a hole", async () => {
    const html = await render(
      "<Image file=\"probe.png\" alt={`hello ${someVar}`} />"
    );
    expect(html).toContain('alt=""');
    expect(html).not.toContain("hello");
  });

  it("passes a template literal without a hole", async () => {
    const html = await render("<Image file=\"probe.png\" alt={`hello`} />");
    expect(html).toContain('alt="hello"');
  });

  it("refuses a spread attribute", async () => {
    await expectPropDropped(`<Image {...{ width: 400 }} file="${IMAGE}" />`);
  });

  it("keeps barring content expressions", async () => {
    expect(await render("hello {someVar} world")).not.toContain("someVar");
  });
});
