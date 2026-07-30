import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// BetterAuth's own endpoints (sign-in, sign-out, session). Everything the
// wiki authorizes lives elsewhere: this handler knows who you are, never what
// you may do (ADR 0023).
const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Free sign-up is closed (docs/permissions.md § Naissance d'un compte):
 * accounts are born of an invitation, and the first one of the installation
 * screen — which calls BetterAuth server-side and never travels through
 * here. Mounting the library's whole surface would otherwise let anyone
 * create themselves an account by hand. Reopening it is a wiki.config.ts
 * setting, which lands with the invitations.
 */
export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    return new Response("Not found", { status: 404 });
  }
  return handler.POST(request);
}
