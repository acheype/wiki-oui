"use client";

// Upload widget of the image and file entry fields (docs/forms.md): sends to
// the wiki's file pool (ADR 0012) and stores the pool name as the value. An
// image shows a thumbnail through the resize API.

import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { imageUrl } from "@/lib/image-url";
import { toast } from "sonner";
import { uploadFile } from "./upload";

export function UploadInput({
  id,
  value,
  kind,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  kind: "image" | "file";
  invalid?: boolean;
  onChange: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProgress(0);
    try {
      const uploaded = await uploadFile(file, setProgress);
      onChange(uploaded.name);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Échec de l'envoi du fichier."
      );
    } finally {
      setProgress(null);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- pool file, resize API
          <img
            src={imageUrl(value, { width: 160, height: 160 })}
            alt=""
            className="size-20 rounded-md border object-cover"
          />
        ) : (
          <FileText className="size-6 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 truncate font-mono text-xs">{value}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Retirer le fichier"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={kind === "image" ? "image/*" : undefined}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        aria-invalid={invalid}
        disabled={progress !== null}
        onClick={() => inputRef.current?.click()}
      >
        {kind === "image" ? <ImagePlus /> : <Paperclip />}
        {progress !== null
          ? `Envoi… ${Math.round(progress * 100)} %`
          : kind === "image"
            ? "Choisir une image"
            : "Choisir un fichier"}
      </Button>
    </div>
  );
}
