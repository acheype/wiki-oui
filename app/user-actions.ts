"use server";

// Server Actions of the users screen (docs/permissions.md § Les écrans).
// Reading them is an administrator's gesture — email addresses are shown
// here and nowhere else — and the check lives behind the door, in
// lib/groups-db.ts.

import { type UserRow, listUsersWithGroups } from "@/lib/groups-db";

export async function listUsers(): Promise<UserRow[]> {
  return listUsersWithGroups();
}
