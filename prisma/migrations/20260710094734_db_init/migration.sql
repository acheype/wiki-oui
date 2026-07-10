-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "tags" TEXT[],
    "ownerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentRevisionId" UUID,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageId" UUID NOT NULL,
    "restoredFromId" UUID,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_currentRevisionId_key" ON "Page"("currentRevisionId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_restoredFromId_fkey" FOREIGN KEY ("restoredFromId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
