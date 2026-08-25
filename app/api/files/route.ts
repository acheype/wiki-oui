import { FILE_FAMILIES } from "@/modules/authoring/descriptor";
import { fileFamily, listFiles, saveFile } from "@/modules/files/storage";
import { formatFileSize } from "@/lib/format";
import { canContributeSomewhere } from "@/modules/pages/rights";
import { REFUSALS } from "@/modules/permissions/rules";
import { wikiConfig } from "@/wiki.config";

// Upload service (ADR 0012): a mutation carried by an API service because
// showing upload progress requires holding the request (xhr.upload.onprogress)
// — a Server Action hides its transport. Limits are checked before any write.
export async function POST(request: Request) {
  // No setting of its own: the question is « cette personne peut-elle contribuer
  // quelque part ? » (docs/permissions.md § Quel droit commande quelle action).
  // A wiki configured open therefore accepts anonymous uploads — that is
  // intended, and rate limiting is another job (backlog).
  if (!(await canContributeSomewhere())) {
    return Response.json({ error: REFUSALS.upload }, { status: 403 });
  }

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
      { error: `Extension non autorisée : «\u00A0${file.name}\u00A0».` },
      { status: 400 }
    );
  }

  const { maxFileSize, maxImageSize } = wikiConfig.upload;
  const limit = family === "image" ? maxImageSize : maxFileSize;
  if (file.size > limit) {
    return Response.json(
      {
        error: `Fichier trop lourd (${formatFileSize(file.size)}) : la limite est de ${formatFileSize(limit)}${family === "image" ? " pour une image" : ""}.`,
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
  const family = FILE_FAMILIES.find((candidate) => candidate === familyParam);
  return Response.json({ files: await listFiles(family) });
}
