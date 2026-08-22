import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
} from "@/modules/accounts/rules";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";
import { prisma } from "@/lib/prisma";
import { isValidUsername } from "@/modules/accounts/username";

// BetterAuth authenticates, WikiOui authorizes (ADR 0023): accounts,
// sessions, passwords and tokens live here; groups, ownership and rights are
// WikiOui code and never enter this config. Neither the `admin` nor the
// `organization` plugin is used — administration is a membership of @Admins,
// not a role column.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // No SMTP is required to run a wiki (docs/permissions.md): a forgotten
    // password is answered by a link an administrator can also hand over.
    requireEmailVerification: false,
    // The floor the installation service announces, applied where it is
    // enforced, so the two cannot drift apart.
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  databaseHooks: {
    session: {
      create: {
        /**
         * A disabled account signs in nowhere (docs/permissions.md § Fin d'un
         * compte). The refusal sits on the creation of the session rather
         * than in the wiki's own sign-in action, because BetterAuth's
         * endpoints are mounted too: one door refused here is every door.
         */
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { disabledAt: true },
          });
          if (!user?.disabledAt) return;
          throw new APIError("FORBIDDEN", {
            code: ACCOUNT_DISABLED_CODE,
            message: ACCOUNT_DISABLED_MESSAGE,
          });
        },
      },
    },
  },
  plugins: [
    // The one plugin that is authentication rather than authorization: it
    // brings the stable identity the rights need, and sign-in by identifier
    // as well as by email. The slug pattern is the whole rule, length
    // included — a second length option here would be a second rule.
    username({ usernameValidator: isValidUsername }),
    // Server Actions and route handlers set the session cookie through it.
    nextCookies(),
  ],
});
