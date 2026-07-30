-- Accounts, groups and the installation flag (docs/permissions.md).
--
-- The wiki stays exactly as open as it was: this migration adds the means to
-- close it, not restrictions. Every `ownerName`/`authorName` held the literal
-- "Anonyme", which the new columns say as NULL — so the columns are dropped
-- rather than converted, and every existing page reads "Anonyme" as before.
-- The special pages get their owner at installation (ADR 0027), the example
-- pages keep none.
--
-- The `onDelete` is not the same everywhere, and that is what carries all the
-- weight (ADR 0024): CASCADE on GroupMember — and later on PageAcl — where
-- the membership is meant to disappear with the person, but SET NULL on
-- ownership and authorship, where the same cascade would destroy pages and
-- pans of history. ON UPDATE CASCADE everywhere: renaming an account renames
-- its signature throughout the history, without a line of code.

-- AlterTable
ALTER TABLE "Form" DROP COLUMN "ownerName",
ADD COLUMN     "ownerUsername" TEXT;

-- AlterTable
ALTER TABLE "Page" DROP COLUMN "ownerName",
ADD COLUMN     "ownerUsername" TEXT;

-- AlterTable
ALTER TABLE "Revision" DROP COLUMN "authorName",
ADD COLUMN     "authorUsername" TEXT;

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" UUID NOT NULL,
    "groupSlug" TEXT NOT NULL,
    "username" TEXT,
    "memberGroupSlug" TEXT,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "installedAt" TIMESTAMP(3),

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "GroupMember_username_idx" ON "GroupMember"("username");

-- CreateIndex
CREATE INDEX "GroupMember_memberGroupSlug_idx" ON "GroupMember"("memberGroupSlug");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupSlug_username_key" ON "GroupMember"("groupSlug", "username");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupSlug_memberGroupSlug_key" ON "GroupMember"("groupSlug", "memberGroupSlug");

-- CreateIndex
CREATE INDEX "Form_ownerUsername_idx" ON "Form"("ownerUsername");

-- CreateIndex
CREATE INDEX "Page_ownerUsername_idx" ON "Page"("ownerUsername");

-- CreateIndex
CREATE INDEX "Revision_authorUsername_idx" ON "Revision"("authorUsername");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupSlug_fkey" FOREIGN KEY ("groupSlug") REFERENCES "Group"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_username_fkey" FOREIGN KEY ("username") REFERENCES "user"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_memberGroupSlug_fkey" FOREIGN KEY ("memberGroupSlug") REFERENCES "Group"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_ownerUsername_fkey" FOREIGN KEY ("ownerUsername") REFERENCES "user"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_ownerUsername_fkey" FOREIGN KEY ("ownerUsername") REFERENCES "user"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_authorUsername_fkey" FOREIGN KEY ("authorUsername") REFERENCES "user"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- A membership names a person or a nested group, never both and never
-- neither. Same shape as the content-xor-data invariant of Revision: the
-- database refuses the state rather than the application detecting it.
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_person_xor_group"
    CHECK (("username" IS NULL) <> ("memberGroupSlug" IS NULL));

-- Settings is a single row, and the id is what says so. It is the first
-- occupant of a table already planned for SMTP, the site title and
-- hot-editable default rights (ADR 0027) — hence a table, not a column
-- somewhere.
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_single_row" CHECK ("id" = 1);
