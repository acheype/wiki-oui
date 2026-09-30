"use server";

import { discardUploadedFile as discard } from "./cancellation";

// Only cancelling the interaction that just created a file removes it.
// The upload needs XHR progress; its cancellation is a Server Action (ADR 0012).
export async function discardUploadedFile(
  name: string,
  cancellationToken: string
): Promise<void> {
  await discard(name, cancellationToken);
}
