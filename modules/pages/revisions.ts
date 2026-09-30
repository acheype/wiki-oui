import { prisma } from "@/lib/prisma";
import { ifReadable } from "./access/guards";
import { PUBLIC_IDENTITY, WITH_RIGHTS } from "./rights";

export async function getPageWithRevisions(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      ...WITH_RIGHTS,
      revisions: {
        orderBy: { createdAt: "asc" },
        include: {
          author: PUBLIC_IDENTITY,
          restoredFrom: { select: { id: true, createdAt: true } },
        },
      },
    },
  });
  return page && ifReadable(page);
}
