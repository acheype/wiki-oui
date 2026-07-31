// Where a screen sends you once it is done — the sign-in screen back to the
// page that asked for it, the installation screen to the home page.

/**
 * The destination travels in a URL, so anyone can write it: a wiki that
 * followed it anywhere would turn its own sign-in screen into an open
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
