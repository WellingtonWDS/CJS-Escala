import { authResponse, readSession } from "./auth.js";
import { createPersistenceHandler } from "./persistence-api.js";
import { createAdminHandler } from "./admin.js";
import { createCompaniesHandler } from "./companies.js";
export function createRoutes({ env, fetchImpl = fetch, now = Date.now }) {
  const admin = createAdminHandler({ env, fetchImpl, now });
  const companies = createCompaniesHandler({ env, fetchImpl, now });
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
    if (path === "/api/admin") return admin(request);
    if (path === "/api/companies") return companies(request);
    return null;
  };
}
