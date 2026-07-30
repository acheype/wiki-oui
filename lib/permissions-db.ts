import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { type Actor, ADMINS_GROUP, VISITOR } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// The database side of the rules (docs/permissions.md): who is acting, and —
// once the rights land — the `where` clauses that decide what they see.

/**
 * The actor behind the current HTTP request, memoized for its duration with
 * React's cache() — the pattern getPageWithCurrent already uses. Never stored
 * in the session: removing someone from a group must take effect at once, not
 * when their session is renewed.
 */
const currentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

export const currentActor = cache(async (): Promise<Actor> => {
  const session = await currentSession();
  const username = session?.user.username ?? null;
  if (!username) return VISITOR;

  const admin = await prisma.groupMember.findFirst({
    where: { groupSlug: ADMINS_GROUP.slug, username },
    select: { id: true },
  });
  return { username, isAdmin: admin !== null };
});

/**
 * The username stamped on what is written now — null for a visitor, which the
 * wiki reads back as "Anonyme". The access layer resolves it itself (ADR
 * 0025) rather than trusting a caller to pass it.
 */
export async function currentUsername(): Promise<string | null> {
  return (await currentActor()).username;
}

/** The signed-in person as the interface names them, null for a visitor. */
export async function currentIdentity(): Promise<{
  username: string;
  name: string;
} | null> {
  const session = await currentSession();
  if (!session?.user.username) return null;
  return { username: session.user.username, name: session.user.name };
}

/**
 * Creates @Admins around its first member, the account the installation
 * screen just made (ADR 0027). Idempotent, so a retried installation
 * converges instead of failing halfway.
 */
export async function createAdminsGroupWith(username: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.group.upsert({
      where: { slug: ADMINS_GROUP.slug },
      create: { slug: ADMINS_GROUP.slug, name: ADMINS_GROUP.name },
      update: {},
    });
    await tx.groupMember.upsert({
      where: {
        groupSlug_username: { groupSlug: ADMINS_GROUP.slug, username },
      },
      create: { groupSlug: ADMINS_GROUP.slug, username },
      update: {},
    });
  });
}
