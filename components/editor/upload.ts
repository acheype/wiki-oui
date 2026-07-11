import type { FileFamily } from "@/lib/files";

// Client side of POST /api/files (ADR 0012): XHR because upload progress
// requires xhr.upload.onprogress — fetch cannot report emission progress.

export type UploadedFile = {
  name: string;
  family: FileFamily;
  size: number;
};

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
          reject(new Error(body.error ?? "Échec de l'envoi du fichier."));
        } else {
          resolve(body as UploadedFile);
        }
      } catch {
        reject(new Error("Échec de l'envoi du fichier."));
      }
    };
    xhr.onerror = () => reject(new Error("Échec de l'envoi du fichier."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

// Cancelling the component modal right after the upload that created the
// file deletes it (« annuler = rien ne s'est passé », ADR 0012).
export async function deleteUploadedFile(name: string): Promise<void> {
  await fetch(`/api/files/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Browsers name pasted screenshots "image.png": anonymous clipboards get a
// dated name instead (docs/architecture.md).
export function withClipboardName(file: File): File {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) return file;
  const extension = file.name.split(".").pop();
  const date = new Date().toISOString().slice(0, 10);
  return new File([file], `capture-${date}.${extension}`, { type: file.type });
}
