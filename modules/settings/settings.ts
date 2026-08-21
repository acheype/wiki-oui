import { prisma } from "@/lib/prisma";

// The single-row Settings table (ADR 0027). It holds one column today; SMTP,
// the site title and hot-editable default rights will move in beside it.

const SETTINGS_ROW = 1;

// Installation is a one-way door, so a `true` read is true forever: the
// process caches it and stops asking. A visitor on an installed wiki must not
// pay a query per request for a fact that cannot change back.
let installedOnce = false;

/**
 * Has this wiki ever been installed? The guard of the installation screen is
 * this flag, deliberately not "does an administrator exist?" (ADR 0027):
 * emptying @Admins must not reopen the screen and hand the wiki over.
 */
export async function isInstalled(): Promise<boolean> {
  if (installedOnce) return true;
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ROW },
    select: { installedAt: true },
  });
  installedOnce = settings?.installedAt != null;
  return installedOnce;
}

/** Closes the door, at the very end of a successful installation. */
export async function markInstalled(): Promise<void> {
  const now = new Date();
  await prisma.settings.upsert({
    where: { id: SETTINGS_ROW },
    create: { id: SETTINGS_ROW, installedAt: now },
    // The row may already exist without the flag, should a later setting
    // create it first; posing the flag is then an update, not an insert.
    update: { installedAt: now },
  });
  installedOnce = true;
}
