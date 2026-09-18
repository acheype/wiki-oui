import type { Page } from "@playwright/test";
import { wikiConfig } from "../../wiki.config";

// Signing in the way a person does (ADR 0032): the connexion page takes email
// or identifier in one field. Shared by the personas setup and the auth
// parcours, so the one flow is written once.
export async function signIn(
  page: Page,
  identifier: string,
  password: string
): Promise<void> {
  await page.goto(`/${wikiConfig.authPages.signIn}`);
  await page.getByLabel("Adresse e-mail ou identifiant").fill(identifier);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`**/${wikiConfig.homeSlug}`);
}
