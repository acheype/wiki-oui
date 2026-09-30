import { prisma } from "@/lib/prisma";

/**
 * Spends any link left on an address once its account exists. The BetterAuth
 * hook is only the trigger: AccountLink belongs to WikiOui and is consumed by
 * its invitation subject, whatever account-creation entry point fired.
 */
export async function consumeLinkForCreatedAccount(email: string): Promise<void> {
  await prisma.accountLink.deleteMany({
    where: { email: email.toLowerCase() },
  });
}
