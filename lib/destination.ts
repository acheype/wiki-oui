// Where a page sends you once it is done — the sign-in system page back to
// the page that asked for it, the installation service to the home page.

/**
 * The query parameter carrying it. The account system pages are wiki pages like
 * any other (ADR 0028), so what they need travels in the query string —
 * `/connexion?suite=/ma-page` — never in a path segment, which a page reads
 * as one of its handlers.
 */
export const DESTINATION_PARAM = "suite";

/**
 * The destination travels in a URL, so anyone can write it: a wiki that
 * followed it anywhere would turn its own sign-in system page into an open
 * redirect, the classic way to make a phishing link look legitimate. Only a
 * path within this wiki is honoured — a single leading slash, since a browser
 * reads a double one as another host.
 */
export function destinationWithinWiki(
  destination: string | undefined,
  fallback: string
): string {
  if (destination?.startsWith("/") && !destination.startsWith("//")) {
    return destination;
  }
  return fallback;
}
