"use server";

// Server Actions of the accounts screen (docs/permissions.md § Les écrans).
// Reading the accounts is an administrator's gesture — email addresses are
// shown here and nowhere else — and the check lives behind the door, in
// lib/groups-db.ts.

import { type AccountRow, listAccounts } from "@/lib/groups-db";

export async function listUsers(): Promise<AccountRow[]> {
  return listAccounts();
}
