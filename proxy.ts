import { type NextRequest, NextResponse } from "next/server";
import { INSTALLATION_PATH } from "@/lib/installation";
import { isInstalled } from "@/lib/settings";

// While the wiki has never been installed, every address shows the
// installation screen — and once it has, that screen stops existing (ADR
// 0027). One place sees every route, so this is where the door is held: a
// page, a handler and a Server Action are all covered by the same rule.
//
// A rewrite rather than a redirect: the screen hides under the one reserved
// segment (ADR 0028), and nobody should have to see or type that address.
// The visitor keeps the address they asked for, and `installation` stays an
// ordinary slug — a page named that way opens the day the wiki is up.
//
// Next runs a proxy on the Node.js runtime, so Prisma is at home here; and
// the flag is irreversible, so lib/settings.ts answers from memory after the
// first read rather than querying on every request.
export async function proxy(request: NextRequest) {
  const installed = await isInstalled();
  const asksForInstallation = request.nextUrl.pathname === INSTALLATION_PATH;

  if (!installed) {
    // Already on the screen: rewriting it onto itself would loop.
    if (asksForInstallation) return NextResponse.next();
    return NextResponse.rewrite(new URL(INSTALLATION_PATH, request.url));
  }
  if (asksForInstallation) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything but Next's own static output — an installation screen that
    // redirected its own stylesheet would show up unstyled.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
