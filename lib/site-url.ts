import { headers } from "next/headers";

/**
 * The wiki's own address, spelled out. A link that leaves the wiki — in a
 * mail, or copied into a chat by an administrator — cannot be relative, and
 * the address it must carry is the one people type: `BETTER_AUTH_URL`, the
 * same setting sign-in already checks its origin against. Falling back on the
 * request's own host keeps a local `pnpm dev` working without any setting.
 */
export async function absoluteUrl(path: string): Promise<string> {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) return new URL(path, configured).toString();

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return new URL(path, `${protocol}://${host}`).toString();
}
