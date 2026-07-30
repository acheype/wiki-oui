import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// The browser half of lib/auth.ts: the plugin list must mirror the server's,
// which is what gives sign-in by identifier as well as by email.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
