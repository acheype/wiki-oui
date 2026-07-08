"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { restoreRevision } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RestoreButton({ revisionId }: { revisionId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreRevision(revisionId);
          if (result?.error) {
            toast.error(result.error);
          }
        })
      }
    >
      {isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
      Restaurer cette révision
    </Button>
  );
}
