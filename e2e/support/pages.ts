import type { Page } from "@playwright/test";

// Authoring an MDX page the way a person does (ADR 0032): through the editor,
// not the database. Shared by the page-lifecycle parcours. The body is inserted
// in one input event rather than typed key by key, so a wiki link's brackets
// reach CodeMirror as text without tripping any per-keystroke helper.

async function writeBody(page: Page, body: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(body);
}

async function save(page: Page, slug: string): Promise<void> {
  // Exact: a warnings panel would also offer « Enregistrer quand même ».
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(`**/${slug}`);
}

/** Create a page at `slug` from the « Créer cette page » invitation. */
export async function createPage(
  page: Page,
  slug: string,
  body: string
): Promise<void> {
  await page.goto(`/${slug}`);
  await page.getByRole("link", { name: "Créer cette page" }).click();
  await page.waitForURL(`**/${slug}/edit`);
  await writeBody(page, body);
  await save(page, slug);
}

/** Replace the whole body of an existing page, minting a new revision. */
export async function editPage(
  page: Page,
  slug: string,
  body: string
): Promise<void> {
  await page.goto(`/${slug}/edit`);
  await writeBody(page, body);
  await save(page, slug);
}
