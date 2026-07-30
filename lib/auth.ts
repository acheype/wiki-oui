import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { isValidUsername } from "@/lib/username";

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
  },
  plugins: [
    // The one plugin that is authentication rather than authorization: it
    // brings the stable identity the rights need, and sign-in by identifier
    // as well as by email.
    username({
      usernameValidator: isValidUsername,
      minUsernameLength: 2,
    }),
    // Server Actions and route handlers set the session cookie through it.
    nextCookies(),
  ],
});
