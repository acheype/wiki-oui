import { type NextRequest, NextResponse } from "next/server";
import { INSTALLATION_PATH } from "@/lib/installation";
import { isInstalled } from "@/lib/settings";

// While the wiki has never been installed, every route leads to the
// installation screen — and once it has, that screen stops existing (ADR
// 0027). One place sees every route, so this is where the door is held: a
// page, a handler and a Server Action are all covered by the same rule.
//
// Next runs a proxy on the Node.js runtime, so Prisma is at home here; and
// the flag is irreversible, so lib/settings.ts answers from memory after the
// first read rather than querying on every request.
export async function proxy(request: NextRequest) {
  const installed = await isInstalled();
  const asksForInstallation = request.nextUrl.pathname === INSTALLATION_PATH;

  if (!installed && !asksForInstallation) {
    return NextResponse.redirect(new URL(INSTALLATION_PATH, request.url));
  }
  if (installed && asksForInstallation) {
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
