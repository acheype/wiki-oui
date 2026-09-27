import { expect, test } from "@playwright/test";

function preview(source: string): string {
  return `/api/render?source=${encodeURIComponent(source)}`;
}

// These wrappers inspect client-component children after React has carried
// them through RSC. A plain React render cannot reproduce that identity
// boundary, so this regression belongs against the real MDX preview route.
test("Accordion keeps its Collapsible children through RSC", async ({ page }) => {
  await page.goto(
    preview(
      '<Accordion><Collapsible title="Premier">Contenu A</Collapsible><Collapsible title="Second">Contenu B</Collapsible></Accordion>'
    )
  );

  const first = page.getByRole("button", { name: "Premier", exact: true });
  await expect(first).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Second", exact: true })
  ).toBeVisible();
  await first.click();
  await expect(page.getByText("Contenu A")).toBeVisible();
});

test("Tabs keeps its Tab children through RSC", async ({ page }) => {
  await page.goto(
    preview(
      '<Tabs><Tab title="Premier">Contenu A</Tab><Tab title="Second">Contenu B</Tab></Tabs>'
    )
  );

  await expect(
    page.getByRole("tab", { name: "Premier", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Second", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Contenu A")).toBeVisible();
});
