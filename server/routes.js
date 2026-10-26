import { authResponse, readSession } from "./auth.js";
import { createPersistenceHandler } from "./persistence-api.js";
export function createRoutes({ env, fetchImpl = fetch, now = Date.now }) {
  const persistence = createPersistenceHandler({
    env,
    fetchImpl,
    now,
    authenticate: async (request) => {
      if (env.AUTH_MODE !== "n8n") return null;
      const s = await readSession(request.headers.get("cookie"), env, now());
      return s?.kind === "individual"
        ? { userId: s.userId, sessionId: s.sessionId, expiresAt: s.exp }
        : null;
    },
  });
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth")
      return authResponse(request, env, now(), { fetchImpl, now });
    if (path === "/api/persistence") return persistence(request);
    return null;
  };
}
