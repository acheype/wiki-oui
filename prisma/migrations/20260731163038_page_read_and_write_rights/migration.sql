-- Read and write rights on a page (docs/permissions.md § Le droit).
--
-- The scope is a column and the list is a table: a scalar on one side, a
-- collection on the other. In an ordinary wiki the vast majority of pages
-- have no row in PageAcl at all, so the common case is decided without ever
-- touching it — on a public page the scope answers and the EXISTS is never
-- run.
--
-- No `admins` scope: the administrators' access is an invariant, and putting
-- it at the same rank as the other three would suggest they can be excluded.
-- The owner is a floor for the same reason, not a line in the list.

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('everyone', 'authenticated', 'restricted');

-- CreateEnum
CREATE TYPE "PermKind" AS ENUM ('READ', 'WRITE');

-- AlterTable
-- Every existing page takes the defaults of wiki.config.ts, which is what the
-- table already holds implicitly: readable by everyone, exactly as open as
-- before. The DEFAULT is only the backfill's vehicle and goes right after —
-- the wiki's defaults are copied at creation by the application (ADR 0026),
-- and a second default in the database would be a second source of truth.
ALTER TABLE "Page" ADD COLUMN     "readScope" "Scope" NOT NULL DEFAULT 'everyone',
ADD COLUMN     "writeScope" "Scope" NOT NULL DEFAULT 'restricted';

ALTER TABLE "Page" ALTER COLUMN "readScope" DROP DEFAULT,
ALTER COLUMN "writeScope" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PageAcl" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "kind" "PermKind" NOT NULL,
    "username" TEXT,
    "groupSlug" TEXT,

    CONSTRAINT "PageAcl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageAcl_username_idx" ON "PageAcl"("username");

-- CreateIndex
CREATE INDEX "PageAcl_groupSlug_idx" ON "PageAcl"("groupSlug");

-- CreateIndex
CREATE UNIQUE INDEX "PageAcl_pageId_kind_username_key" ON "PageAcl"("pageId", "kind", "username");

-- CreateIndex
CREATE UNIQUE INDEX "PageAcl_pageId_kind_groupSlug_key" ON "PageAcl"("pageId", "kind", "groupSlug");

-- AddForeignKey
ALTER TABLE "PageAcl" ADD CONSTRAINT "PageAcl_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade on both sides, where ownership took SET NULL (ADR 0024): a right
-- disappearing with the person or the group it names is the intended effect,
-- while the same cascade on a page would have destroyed the page.
ALTER TABLE "PageAcl" ADD CONSTRAINT "PageAcl_username_fkey" FOREIGN KEY ("username") REFERENCES "user"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAcl" ADD CONSTRAINT "PageAcl_groupSlug_fkey" FOREIGN KEY ("groupSlug") REFERENCES "Group"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- A line of the list names a person or a group, never both and never neither
-- — the same shape as GroupMember's invariant, held by the database rather
-- than detected by the application.
ALTER TABLE "PageAcl" ADD CONSTRAINT "PageAcl_person_xor_group"
    CHECK (("username" IS NULL) <> ("groupSlug" IS NULL));
