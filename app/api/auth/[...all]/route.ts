import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { wikiConfig } from "@/wiki.config";

// BetterAuth's own endpoints (sign-in, sign-out, session). Everything the
// wiki authorizes lives elsewhere: this handler knows who you are, never what
// you may do (ADR 0023).
const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Free sign-up is closed by default (docs/permissions.md § Naissance d'un
 * compte): accounts are born of an invitation, and the first one of the
 * installation screen — both of which call BetterAuth server-side and never
 * travel through here. Mounting the library's whole surface would otherwise
 * leave anyone free to create themselves an account by hand, whatever the
 * screens offer. Opening `openSignUp` reopens this path too, since that is
 * exactly what the setting means.
 */
export async function POST(request: Request): Promise<Response> {
  const closed =
    !wikiConfig.openSignUp &&
    new URL(request.url).pathname.endsWith("/sign-up/email");
  if (closed) {
    return new Response("Not found", { status: 404 });
  }
  return handler.POST(request);
}
