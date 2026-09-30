import { createHmac, timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { deleteFile, filePath } from "../library/storage";

const REFUSED = "Cette annulation ne correspond pas au fichier envoyé.";

function signingSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to sign upload cancellation tokens");
  return secret;
}

async function fingerprint(name: string): Promise<string> {
  const safeName = path.basename(name);
  const info = await stat(filePath(safeName), { bigint: true });
  return [safeName, info.dev, info.ino, info.size, info.ctimeNs].join("\0");
}

function sign(value: string): Buffer {
  return createHmac("sha256", signingSecret())
    .update("wikioui:upload-cancellation\0")
    .update(value)
    .digest();
}

/** Issues an unforgeable capability bound to the exact file just written. */
export async function issueCancellationToken(name: string): Promise<string> {
  return sign(await fingerprint(name)).toString("base64url");
}

/** Deletes only the same filesystem entry for which the upload issued a token. */
export async function discardUploadedFile(
  name: string,
  token: string
): Promise<void> {
  let current: string;
  try {
    current = await fingerprint(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const expected = sign(current);
  const supplied = Buffer.from(token, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error(REFUSED);
  }
  await deleteFile(name);
}
