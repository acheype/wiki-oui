import { readdir, stat } from "node:fs/promises";
import { FILE_FAMILIES, type FileFamily } from "@/modules/authoring/descriptor";
import { canContributeSomewhere } from "@/modules/pages/rights";
import { REFUSALS } from "@/modules/permissions/rules";
import { formatFileSize } from "@/lib/format";
import { wikiConfig } from "@/wiki.config";
import { FILES_DIR, filePath, fileFamily, saveFile } from "./library/storage";
import { issueCancellationToken } from "./upload/cancellation";

interface StoredFile {
  name: string;
  family: FileFamily;
  size: number;
  modifiedAt: Date;
}

// Uploads are permitted wherever this person can contribute, including an
// anonymous contributor to an open wiki (docs/permissions.md).
export async function receiveFile(file: File | null) {
  if (!(await canContributeSomewhere())) {
    return { error: REFUSALS.upload, status: 403 } as const;
  }
  if (!file) return { error: "Requête invalide : fichier manquant.", status: 400 } as const;
  const family = fileFamily(file.name);
  if (family === null) {
    return { error: `Extension non autorisée : « ${file.name} ».`, status: 400 } as const;
  }
  const { maxFileSize, maxImageSize } = wikiConfig.upload;
  const limit = family === "image" ? maxImageSize : maxFileSize;
  if (file.size > limit) {
    return {
      error: `Fichier trop lourd (${formatFileSize(file.size)}) : la limite est de ${formatFileSize(limit)}${family === "image" ? " pour une image" : ""}.`,
      status: 400,
    } as const;
  }
  const name = await saveFile(file.name, new Uint8Array(await file.arrayBuffer()));
  const cancellationToken = await issueCancellationToken(name);
  return { name, family, size: file.size, cancellationToken };
}

export async function listFiles(familyParam?: string | null): Promise<StoredFile[]> {
  const family = FILE_FAMILIES.find((candidate) => candidate === familyParam);
  let entries: string[];
  try {
    entries = await readdir(FILES_DIR);
  } catch {
    return []; // the directory appears with the first upload
  }
  const files = await Promise.all(
    entries.sort().map(async (name): Promise<StoredFile | null> => {
      const fileFamilyName = fileFamily(name);
      if (fileFamilyName === null) return null;
      if (family && fileFamilyName !== family) return null;
      const info = await stat(filePath(name));
      if (!info.isFile()) return null;
      return {
        name,
        family: fileFamilyName,
        size: info.size,
        modifiedAt: info.mtime,
      };
    })
  );
  return files.filter((file) => file !== null);
}
