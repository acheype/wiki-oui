import { ADMINS_GROUP } from "@/modules/permissions/rules";
import { prisma } from "@/lib/prisma";

// The two group writes that happen without an administrator acting: one at
// installation (before any administrator exists), one when an invitation is
// accepted (the token is the credential, not a person). Both are deliberately
// unguarded — see UNGUARDED_WRITES in scripts/verify-access/scan.ts.

/**
 * Creates @Admins around its first member, the account the installation
 * service just made (ADR 0027). Idempotent, so a retried installation
 * converges instead of failing halfway — and person-free, since it runs
 * before anyone can be an administrator.
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

/**
 * The membership an accepted invitation carries out. No administrator is
 * acting — the person joining is nobody's — and what allows it is the
 * invitation that named the group, back when one did have the say.
 */
export async function joinGroupOnInvitation(
  groupSlug: string,
  username: string
): Promise<void> {
  await prisma.groupMember.upsert({
    where: { groupSlug_username: { groupSlug, username } },
    create: { groupSlug, username },
    update: {},
  });
}
