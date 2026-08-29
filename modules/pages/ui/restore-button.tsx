"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { restoreRevision } from "@/modules/pages/content-actions";
import { Button } from "@/components/ui/button";

export function RestoreButton({ revisionId }: { revisionId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreRevision(revisionId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          // A restored entry is current, so it normally follows its form's
          // current gabarit (ADR 0020). When that gabarit computes to
          // nothing, the archived title survives instead — the one case
          // where the restore did not do quite what it says.
          if (result.titleKept) {
            toast.warning(
              "Révision restaurée. Le titre a été conservé : le gabarit du titre automatique produit une chaîne vide pour cette fiche."
            );
          }
          // Navigation moved here from the action (see RestoreResult): same
          // landing page as before, but now the message can travel.
          router.push(`/${result.slug}`);
        })
      }
    >
      {isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
      Restaurer cette révision
    </Button>
  );
}
