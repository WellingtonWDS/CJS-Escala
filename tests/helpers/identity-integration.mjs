import { createServer } from "node:http";
import assert from "node:assert/strict";
import { signJwt } from "../../server/jwt.js";
import { readSession } from "../../server/auth.js";
import { rpcToken } from "../../server/services/persistence.js";
import { createDevServer } from "../../scripts/serve.js";
export async function testIdentityIntegration({
  env,
  sql,
  browserTest = false,
}) {
  const key = "n8n-identity-only-secret-for-integration";
  const serviceKey = "n8n-service-only-secret-for-integration";
  const identityServer = createServer(async (req, res) => {
    if (req.headers["x-cjs-service-key"] !== serviceKey) {
      res.writeHead(401).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.password !== "correct-pass") {
      res.writeHead(401).end();
      return;
    }
    const sub =
      {
        "admin-a@example.test": "test:admin-a",
        "admin-b@example.test": "test:admin-b",
      }[body.email] || "missing";
    const iat = Math.floor(Date.now() / 1000),
      token = await signJwt(
        {
          sub,
          iss: "cjs-test-identity",
          aud: "cjs-test-login",
          iat,
          exp: iat + 3600,
        },
        key,
      );
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ success: true, token }));
  });
  let app;
  await new Promise((r) => identityServer.listen(0, "127.0.0.1", r));
  const settings = {
    ...env,
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "individual-cookie-secret-for-integration",
    N8N_LOGIN_URL: `http://127.0.0.1:${identityServer.address().port}/login`,
    N8N_SERVICE_SECRET: serviceKey,
    N8N_JWT_SECRET: key,
    N8N_JWT_ISSUER: "cjs-test-identity",
    N8N_JWT_AUDIENCE: "cjs-test-login",
  };
  try {
    app = createDevServer({ root: process.cwd() + "/dist", env: settings });
    await new Promise((r) => app.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${app.address().port}`;
    const post = (path, body, cookie) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    assert.equal((await fetch(`${base}/api/auth?config=1`)).status, 200);
    assert.equal(
      (
        await post("/api/auth", {
          email: "admin-a@example.test",
          password: "incorrect",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await post("/api/auth", {
          email: "unknown@example.test",
          password: "correct-pass",
        })
      ).status,
      403,
    );
    const login = await post("/api/auth", {
      email: "admin-a@example.test",
      password: "correct-pass",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const auth = await fetch(`${base}/api/auth`, {
      headers: { Cookie: cookie },
    });
    assert.equal(
      (await auth.json()).user.id,
      "10000000-0000-0000-0000-000000000001",
    );
    const companies = await post(
      "/api/persistence",
      { action: "listOffices" },
      cookie,
    );
    assert.equal(
      (await companies.json())[0].id,
      "20000000-0000-0000-0000-000000000001",
    );
    const session = await readSession(cookie, settings),
      actor = rpcToken(
        {
          userId: session.userId,
          sessionId: session.sessionId,
          expiresAt: session.exp,
        },
        env.PERSISTENCE_JWT_SECRET,
      );
    const callRpc = (name, token, body = {}) =>
      fetch(`${env.PERSISTENCE_RPC_URL}/rpc/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await callRpc("open_session", actor, {
          p_expires_at: new Date(Date.now() + 3600000).toISOString(),
        })
      ).status,
      403,
    );
    const iat = Math.floor(Date.now() / 1000),
      gateway = await signJwt(
        {
          role: "cjs_identity_gateway",
          purpose: "identity",
          sub: "test:admin-a",
          iss: "cjs-escala-api",
          aud: "cjs-postgrest",
          iat,
          exp: iat + 60,
        },
        env.PERSISTENCE_JWT_SECRET,
      );
    assert.equal((await callRpc("list_offices", gateway)).status, 403);
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await callRpc("login_attempt", gateway, { p_bucket: "a".repeat(64) }))
          .status,
        204,
      );
    assert.equal(
      (await callRpc("login_attempt", gateway, { p_bucket: "a".repeat(64) }))
        .status,
      429,
    );
    const logout = await post("/api/auth", { action: "logout" }, cookie);
    assert.equal(logout.status, 200);
    assert.equal(
      (await post("/api/persistence", { action: "listOffices" }, cookie))
        .status,
      401,
    );
    assert.equal(
      (await fetch(`${base}/api/auth`, { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal(
      (await post("/api/auth", { action: "logout" }, cookie)).status,
      200,
    );
    if (browserTest) {
      const { chromium } = await import("playwright");
      const { default: run } = await import("../browser-individual.cjs");
      let browser;
      try {
        browser = await chromium.launch({
          headless: true,
          ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
              }
            : {}),
        });
        await run({ browser, baseURL: base, sql });
      } finally {
        await browser?.close();
      }
    }
    console.log(
      "OK: login por provedor simulado com JWT real e PostgreSQL/PostgREST reais, abertura/revogação, limite de tentativas, separação de papéis de identidade/dados e API HTTP portátil.",
    );
  } finally {
    if (app) await new Promise((r) => app.close(r));
    await new Promise((r) => identityServer.close(r));
  }
}
