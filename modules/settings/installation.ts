// The first-visit service that creates the administrator account (ADR 0027).
// Shared by the service, its Server Action and the proxy that guards it, so
// nothing here may reach the database or BetterAuth.

import { API_SEGMENT } from "@/lib/slug";

/**
 * A real route, not a wiki page (ADR 0028): the service must answer before any
 * page can be read, and stops answering the day the wiki is installed. It
 * hides under the one reserved segment rather than taking `/installation`,
 * which stays a slug like any other — the proxy rewrites whatever address was
 * asked for onto it, so nobody ever types this one.
 */
export const INSTALLATION_PATH = `/${API_SEGMENT}/installation`;

/**
 * The identity of the initial account, imposed rather than asked. Every
 * WikiOui installation looks alike, so support can say "sign in as
 * wiki-admin" without asking anything first (ADR 0027). Nothing is frozen
 * for good: the name changes from the profile, the identifier by the rename
 * action, and the account can be deleted once another administrator exists.
 */
export const INSTALLER = { name: "Wiki Admin", username: "wiki-admin" } as const;

/** BetterAuth's own floor, restated here so the service can announce it. */
export const MIN_PASSWORD_LENGTH = 8;
