// The first-visit screen that creates the administrator account (ADR 0027).
// Shared by the screen, its Server Action and the proxy that guards it, so
// nothing here may reach the database or BetterAuth.

import { ROUTE_SEGMENTS } from "@/lib/slug";

/**
 * A real route, not a wiki page (ADR 0028): it must answer before any page
 * exists, and it stops answering the day the wiki is installed.
 */
export const INSTALLATION_PATH = `/${ROUTE_SEGMENTS.installation}`;

/**
 * The identity of the initial account, imposed rather than asked. Every
 * WikiOui installation looks alike, so support can say "sign in as
 * wiki-admin" without asking anything first (ADR 0027). Nothing is frozen
 * for good: the name changes from the profile, the identifier by the rename
 * gesture, and the account can be deleted once another administrator exists.
 */
export const INSTALLER = { name: "Wiki Admin", username: "wiki-admin" } as const;

/** BetterAuth's own floor, restated here so the screen can announce it. */
export const MIN_PASSWORD_LENGTH = 8;
