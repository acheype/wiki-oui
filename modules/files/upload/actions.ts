"use server";

import { deleteFile } from "../library/storage";

// Only cancelling the interaction that just created a file removes it.
// The upload needs XHR progress; its cancellation is a Server Action (ADR 0012).
export async function discardUploadedFile(name: string): Promise<void> {
  try {
    await deleteFile(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
