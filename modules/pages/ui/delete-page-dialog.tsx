"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deletePage } from "@/modules/pages/content-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PageDialogProps } from "@/modules/pages/ui/page-dialog";

// « Supprimer » — mounted open by the action-bar overflow menu
// (page-actions-menu.tsx), so it carries no trigger of its own.
export function DeletePageDialog({ slug, onClose }: PageDialogProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer «&nbsp;{slug}&nbsp;» ?</AlertDialogTitle>
          <AlertDialogDescription>
            La page et tout son historique de révisions seront définitivement
            supprimés. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await deletePage(slug);
                if (result?.error) {
                  toast.error(result.error);
                }
              })
            }
          >
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
