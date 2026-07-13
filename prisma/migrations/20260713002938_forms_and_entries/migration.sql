-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "formId" UUID;

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN     "data" JSONB,
ALTER COLUMN "content" DROP NOT NULL;

-- Invariant (ADR 0014): a revision snapshot is either MDX (content) or
-- field values (data), never both, never neither.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_content_xor_data"
    CHECK (("content" IS NULL) <> ("data" IS NULL));

-- CreateTable
CREATE TABLE "Form" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerName" TEXT,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
