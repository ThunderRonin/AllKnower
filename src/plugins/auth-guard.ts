import Elysia from "elysia";
import { auth } from "../auth/index.ts";

/**
 * Scoped middleware that enforces an active better-auth session.
 * Apply with `.use(requireAuth)` on any route group that needs protection.
 * Returns 401 JSON if no valid session cookie/bearer token is present.
 */
export const requireAuth = new Elysia({ name: "allknower/require-auth" })
    .resolve({ as: "scoped" }, async ({ request }) => ({
        session: await auth.api.getSession({ headers: request.headers }),
    }))
    .onBeforeHandle({ as: "scoped" }, ({ session, set }) => {
        if (!session) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
    });
