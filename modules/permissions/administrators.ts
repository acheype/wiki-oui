import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assertAdmin, currentUsername } from "./person";
import { ADMINS_GROUP, REFUSALS } from "./rules";

async function assertOwnAccountOrAdmin(username: string): Promise<void> {
  if (await currentUsername() !== username) await assertAdmin();
}

async function departureRefusal(
  db: Prisma.TransactionClient,
  username: string
): Promise<string | null> {
  const active = await db.groupMember.findMany({
    where: {
      groupSlug: ADMINS_GROUP.slug,
      user: { disabledAt: null },
    },
    select: { username: true },
  });
  return active.length === 1 && active[0].username === username
    ? REFUSALS.lastAdmin
    : null;
}

/** Preview only: a mutation must decide again inside preservingAdministrator. */
export async function administratorDepartureRefusal(username: string): Promise<string | null> {
  await assertOwnAccountOrAdmin(username);
  return departureRefusal(prisma, username);
}

/**
 * Removing an Admins membership, disabling and erasing an account all spend
 * the same invariant. Lock the stable group row before reading active members:
 * two departures cannot each count the other as the administrator who stays.
 * ReadCommitted gives the waiter a fresh snapshot after the lock is acquired.
 * The caller keeps its own authorization and writes through this transaction.
 */
export async function preservingAdministrator(
  username: string,
  change: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<string | null> {
  await assertOwnAccountOrAdmin(username);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "slug" FROM "Group" WHERE "slug" = ${ADMINS_GROUP.slug} FOR UPDATE`;
    const refusal = await departureRefusal(tx, username);
    if (refusal) return refusal;
    await change(tx);
    return null;
  }, { isolationLevel: "ReadCommitted" });
}
