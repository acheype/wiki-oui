import { test as setup } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { PERSONAS } from "./support/personas";
import { acceptInvitation, inviteAndGetLink } from "./support/invitations";
import { signIn } from "./support/sign-in";

// Mints the non-admin personas the permission parcours need (ADR 0032),
// through the real invitation flow — the only path that forges a usable
// account, the seed staying pure data (ADR 0027). Depends on the install,
// which minted the admin who does the inviting. The admin signs in explicitly
// (the install service does not persist a reusable session for the harness),
// and every role's signed-in storageState is saved for the specs to reuse.

setup("mint the personas", async ({ browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN.email, ADMIN.password);
  await admin.storageState({ path: ADMIN.statePath });

  for (const persona of PERSONAS) {
    const link = await inviteAndGetLink(adminPage, persona.email);
    // Accept in a fresh context: the token is the whole credential, and the
    // saved state must be the persona's alone, not the admin's plus theirs.
    const context = await browser.newContext();
    await acceptInvitation(
      await context.newPage(),
      link,
      persona.name,
      persona.password
    );
    await context.storageState({ path: persona.statePath });
    await context.close();
  }

  await admin.close();
});
