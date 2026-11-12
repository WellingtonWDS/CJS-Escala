const { test } = require("node:test");
const assert = require("node:assert/strict");
test("API diagnóstico exige sessão individual, origem, método e payload; identidade não vem do corpo", async () => {
  const { createDiagnosticsHandler } = await import("../server/diagnostics.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now(),
    env = {
      AUTH_MODE: "n8n",
      AUTH_SESSION_SECRET: "diagnostic-unit-cookie-secret-long-enough",
      PERSISTENCE_RPC_URL: "https://rpc.example",
      PERSISTENCE_JWT_SECRET: "diagnostic-unit-rpc-secret-long-enough",
    };
  const token = await issueSession(env, now, {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: now + 3600000,
  });
  const calls = [],
    handler = createDiagnosticsHandler({
      env,
      now: () => now,
      fetchImpl: async (url, o) => {
        calls.push({ url, args: JSON.parse(o.body) });
        return Response.json({ id: "saved", revision: 1 });
      },
    });
  const body = {
    action: "save",
    officeId: "20000000-0000-0000-0000-000000000001",
    companyId: "30000000-0000-0000-0000-000000000001",
    id: "50000000-0000-4000-8000-000000000001",
    revision: 0,
    key: "60000000-0000-4000-8000-000000000001",
    status: "rascunho",
    data: { schemaVersion: 1, answers: {} },
  };
  const req = (b = body, extra = {}) =>
    new Request("https://app.example/api/diagnostics", {
      method: "POST",
      headers: {
        cookie: "cjs_session=" + token,
        origin: "https://app.example",
        "content-type": "application/json",
        ...extra,
      },
      body: JSON.stringify(b),
    });
  assert.equal(
    (await handler(new Request("https://app.example/api/diagnostics"))).status,
    401,
  );
  assert.equal(
    (await handler(req(body, { origin: "https://evil.example" }))).status,
    403,
  );
  assert.equal(
    (await handler(req(body, { "content-type": "text/plain" }))).status,
    415,
  );
  assert.equal((await handler(req({ ...body, key: "bad" }))).status, 400);
  assert.equal(
    (await handler(req({ ...body, status: "concluido" }))).status,
    400,
  );
  assert.equal(
    (await handler(req({ ...body, padding: "x".repeat(200000) }))).status,
    413,
  );
  assert.equal((await handler(req(null))).status, 400);
  assert.equal((await handler(req([]))).status, 400);
  assert.equal(
    (await handler(req({ ...body, status: undefined }))).status,
    400,
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (await handler(req({ ...body, role: "admin", userId: "fake" }))).status,
    200,
  );
  assert(calls[0].url.endsWith("/rpc/diagnostic_save"));
  assert.equal(calls[0].args.p_office_id, body.officeId);
  assert(!("userId" in calls[0].args));
  assert(!("role" in calls[0].args));
});
test("erro de migração não vira confirmação de salvamento nem expõe detalhes do PostgREST", async () => {
  const { createDiagnosticsHandler } = await import("../server/diagnostics.js");
  const { issueSession } = await import("../server/auth.js");
  const env = {
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "diagnostic-unit-cookie-secret-long-enough",
    PERSISTENCE_RPC_URL: "https://rpc.example",
    PERSISTENCE_JWT_SECRET: "diagnostic-unit-rpc-secret-long-enough",
  };
  const token = await issueSession(env, Date.now(), {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: Date.now() + 3600000,
  });
  const h = createDiagnosticsHandler({
    env,
    fetchImpl: async () =>
      Response.json(
        { code: "PGRST202", details: "private internals" },
        { status: 404 },
      ),
  });
  const r = await h(
    new Request("https://app.example/api/diagnostics", {
      headers: { cookie: "cjs_session=" + token },
    }),
  );
  assert.equal(r.status, 503);
  const text = await r.text();
  assert.match(text, /009/);
  assert.doesNotMatch(text, /private internals|PGRST202/);
});
