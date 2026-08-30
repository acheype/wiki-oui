import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { toast } from "sonner";
import { withClipboardName } from "@/modules/files/upload";

// Two of the three upload doors (docs/architecture.md): drag & drop (the
// caret moves to the pointer position at drop time) and paste. One file at
// a time — several files or a folder get a clear toast.
export function uploadDoors(onFile: (file: File) => void): Extension {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    drop(event, view) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;
      event.preventDefault();
      if (files.length > 1) {
        toast.error("Un seul fichier à la fois.");
        return true;
      }
      const entry = event.dataTransfer?.items?.[0]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        toast.error("Impossible d'uploader un dossier : déposez un fichier.");
        return true;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      onFile(files[0]);
      return true;
    },
    paste(event) {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return false;
      event.preventDefault();
      if (files.length > 1) {
        toast.error("Un seul fichier à la fois.");
        return true;
      }
      onFile(withClipboardName(files[0]));
      return true;
    },
  });
}
