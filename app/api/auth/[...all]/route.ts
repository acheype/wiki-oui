import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// BetterAuth's own endpoints (sign-in, sign-out, session). Everything the
// wiki authorizes lives elsewhere: this handler knows who you are, never what
// you may do (ADR 0023).
export const { GET, POST } = toNextJsHandler(auth);
