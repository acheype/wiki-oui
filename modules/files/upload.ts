import { discardUploadedFile } from "./upload/actions";
import type { FileFamily } from "@/modules/authoring/descriptor";
import { captureFileName } from "@/lib/format";

// Client side of POST /api/files (ADR 0012): XHR because upload progress
// requires xhr.upload.onprogress — fetch cannot report emission progress.

export type UploadedFile = {
  name: string;
  family: FileFamily;
  size: number;
};

// Browsers name pasted screenshots "image.png": anonymous clipboards get a
// dated name instead (docs/architecture.md).
export function withClipboardName(file: File): File {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) return file;
  const extension = file.name.split(".").pop() ?? "png";
  return new File([file], captureFileName(extension), { type: file.type });
}

/** A new upload belongs to this interaction until accepted or cancelled. */
export function createUploadSession() {
  let pending: UploadedFile | null = null;
  let uploading = false;
  return {
    async upload(file: File, onProgress: (fraction: number) => void): Promise<UploadedFile> {
      if (uploading || pending) throw new Error("Terminez l'insertion du fichier en cours.");
      uploading = true;
      try {
        pending = await uploadFile(file, onProgress);
        return pending;
      } finally {
        uploading = false;
      }
    },
    accept() {
      pending = null;
    },
    async cancel(): Promise<boolean> {
      const file = pending;
      if (!file) return false;
      pending = null;
      await discardUploadedFile(file.name);
      return true;
    },
  };
}

const UPLOAD_FAILED = "Échec de l'envoi du fichier.";

export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) {
          reject(new Error(body.error ?? UPLOAD_FAILED));
        } else {
          resolve(body as UploadedFile);
        }
      } catch {
        reject(new Error(UPLOAD_FAILED));
      }
    };
    xhr.onerror = () => reject(new Error(UPLOAD_FAILED));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
