import {
  fileFamily,
  listFiles,
  saveFile,
  type FileFamily,
} from "@/lib/files";
import { wikiConfig } from "@/wiki.config";

// Upload service (ADR 0012): a mutation carried by an API service because
// showing upload progress requires holding the request (xhr.upload.onprogress)
// — a Server Action hides its transport. Limits are checked before any write.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Requête invalide : fichier manquant." },
      { status: 400 }
    );
  }

  const family = fileFamily(file.name);
  if (family === null) {
    return Response.json(
      { error: `Extension non autorisée : « ${file.name} ».` },
      { status: 400 }
    );
  }

  const { maxFileSize, maxImageSize } = wikiConfig.upload;
  const limit = family === "image" ? maxImageSize : maxFileSize;
  if (file.size > limit) {
    return Response.json(
      {
        error: `Fichier trop lourd (${Math.round(file.size / 100_000) / 10} Mo) : la limite est de ${limit / 1_000_000} Mo${family === "image" ? " pour une image" : ""}.`,
      },
      { status: 400 }
    );
  }

  const name = await saveFile(file.name, new Uint8Array(await file.arrayBuffer()));
  return Response.json({ name, family, size: file.size });
}

// Library listing for the file-list comboboxes, filterable by family.
export async function GET(request: Request) {
  const familyParam = new URL(request.url).searchParams.get("family");
  const family = (["image", "pdf", "other"] as const).find(
    (candidate) => candidate === familyParam
  ) as FileFamily | undefined;
  return Response.json({ files: await listFiles(family) });
}
