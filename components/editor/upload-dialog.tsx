"use client";

import { FileDown, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/format";

export type UploadDialogState =
  | { phase: "uploading"; fileName: string; size: number; progress: number }
  | { phase: "pdf-choice"; name: string }
  | null;

// Upload pipeline modal (docs/architecture.md): name, size and progress
// while POSTing to /api/files; then, for the pdf family only, the
// mini-choice between embedding (<Pdf>) and a download link (<FileLink>).
export function UploadDialog({
  state,
  onOpenChange,
  onPdfChoice,
}: {
  state: UploadDialogState;
  onOpenChange: (open: boolean) => void;
  onPdfChoice: (component: "Pdf" | "FileLink") => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {state?.phase === "uploading" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Envoi en cours…
              </DialogTitle>
              <DialogDescription>
                {state.fileName} — {formatFileSize(state.size)}
              </DialogDescription>
            </DialogHeader>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(state.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
          </>
        )}
        {state?.phase === "pdf-choice" && (
          <>
            <DialogHeader>
              <DialogTitle>Fichier PDF envoyé</DialogTitle>
              <DialogDescription>
                Comment insérer « {state.name} » dans la page ?
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 py-3"
                onClick={() => onPdfChoice("Pdf")}
              >
                <FileText className="size-5 shrink-0" aria-hidden />
                <span className="grid text-left">
                  <span>Intégrer le contenu dans la page</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Le PDF s&apos;affiche via le lecteur du navigateur.
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 py-3"
                onClick={() => onPdfChoice("FileLink")}
              >
                <FileDown className="size-5 shrink-0" aria-hidden />
                <span className="grid text-left">
                  <span>Insérer un lien de téléchargement</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Le nom et la taille du fichier, cliquables.
                  </span>
                </span>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
