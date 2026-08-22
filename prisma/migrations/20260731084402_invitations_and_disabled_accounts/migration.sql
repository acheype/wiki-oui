-- Invitations and disabled accounts (docs/permissions.md § Comptes).
--
-- Nothing here closes anything by itself: an existing wiki keeps every
-- account signed in and every page where it was. What appears is the way
-- accounts are born from now on — a single-use link — and the reversible way
-- one stops being able to sign in.
--
-- The link's `email` is unique because a second invitation to the same
-- address must refresh the first, never open a second door; and only the
-- fingerprint of the token is stored, so a stolen dump opens nothing.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountLink" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupSlug" TEXT,

    CONSTRAINT "AccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountLink_email_key" ON "AccountLink"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountLink_tokenHash_key" ON "AccountLink"("tokenHash");

-- AddForeignKey
ALTER TABLE "AccountLink" ADD CONSTRAINT "AccountLink_groupSlug_fkey" FOREIGN KEY ("groupSlug") REFERENCES "Group"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
