const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let sign, verify, auth, read, issue, routes;
const now = Date.now(),
  seconds = Math.floor(now / 1000),
  userId = "10000000-0000-0000-0000-000000000001",
  sessionId = "40000000-0000-0000-0000-000000000001";
const env = {
  AUTH_MODE: "n8n",
  AUTH_SESSION_SECRET: "individual-cookie-secret-test-only-long",
  N8N_LOGIN_URL: "https://identity.example/login",
  N8N_SERVICE_SECRET: "header-service-secret-test-only-long",
  N8N_JWT_SECRET: "external-identity-secret-test-only-long",
  N8N_JWT_ISSUER: "https://identity.example",
  N8N_JWT_AUDIENCE: "cjs-login",
  PERSISTENCE_RPC_URL: "https://rpc.example",
  PERSISTENCE_JWT_SECRET: "internal-rpc-secret-test-only-long",
  PERSISTENCE_ENABLED: "true",
};
const claims = {
  sub: "provider:1",
  iss: env.N8N_JWT_ISSUER,
  aud: env.N8N_JWT_AUDIENCE,
  iat: seconds,
  exp: seconds + 3600,
};
before(async () => {
  ({ signJwt: sign, verifyIdentityJwt: verify } = await import(
    "../server/jwt.js"
  ));
  ({
    authResponse: auth,
    readSession: read,
    issueSession: issue,
  } = await import("../server/auth.js"));
  ({ createRoutes: routes } = await import("../server/routes.js"));
});
const request = (body, cookie) =>
  new Request("https://escala.example/api/auth", {
    method: "POST",
    headers: {
      Origin: "https://escala.example",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
function upstream(token, records = []) {
  return async (url, opts) => {
    records.push({ url, opts });
    if (url === env.N8N_LOGIN_URL)
      return Response.json({ success: true, token });
    if (url.endsWith("/login_attempt"))
      return new Response(null, { status: 204 });
    if (url.endsWith("/open_session"))
      return Response.json({
        userId,
        sessionId,
        expiresAt: (seconds + 3600) * 1000,
        name: "Exemplo",
      });
    if (url.endsWith("/get_identity"))
      return Response.json({ id: userId, name: "Exemplo" });
    if (url.endsWith("/revoke_session"))
      return new Response(null, { status: 204 });
    if (url.endsWith("/list_offices")) return Response.json([]);
    throw Error("Unexpected request");
  };
}
test("JWT de identidade exige assinatura, algoritmo, emissor, audiência e expiração explícita de até 12h", async () => {
  assert.equal(
    (await verify(await sign(claims, env.N8N_JWT_SECRET), env, now)).subject,
    claims.sub,
  );
  for (const change of [
    { iss: "other" },
    { aud: "other" },
    { exp: seconds - 1 },
    { exp: seconds + 43201 },
    { iat: seconds + 1 },
    { exp: undefined },
    { sub: 123 },
    { nbf: seconds + 100 },
  ])
    await assert.rejects(() =>
      sign({ ...claims, ...change }, env.N8N_JWT_SECRET).then((t) =>
        verify(t, env, now),
      ),
    );
  const good = await sign(claims, env.N8N_JWT_SECRET);
  await assert.rejects(() => verify(good + "x", env, now));
  await assert.rejects(() =>
    verify(good, { ...env, N8N_JWT_AUDIENCE: "" }, now),
  );
});
test("login individual valida n8n, abre sessão e devolve apenas cookie HttpOnly, sem token no navegador", async () => {
  const records = [],
    token = await sign({ ...claims, role: "postgres" }, env.N8N_JWT_SECRET),
    fetchImpl = upstream(token, records);
  const result = await auth(
    request({
      email: "  USER@EXAMPLE.TEST ",
      password: "correct-pass",
      role: "postgres",
      userId: "fake",
    }),
    env,
    now,
    { fetchImpl },
  );
  assert.equal(result.status, 200);
  assert.equal((await result.clone().json()).token, undefined);
  const cookie = result.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  const session = await read(cookie, env, now);
  assert.equal(session.userId, userId);
  assert.equal(session.sessionId, sessionId);
  assert.equal(session.exp, (seconds + 3600) * 1000);
  const login = records.find((r) => r.url === env.N8N_LOGIN_URL);
  assert.equal(login.opts.headers["X-CJS-Service-Key"], env.N8N_SERVICE_SECRET);
  assert.equal(JSON.parse(login.opts.body).email, "user@example.test");
  const open = records.find((r) => r.url.endsWith("/open_session")),
    gateway = JSON.parse(
      Buffer.from(open.opts.headers.Authorization.split(".")[1], "base64url"),
    );
  assert.equal(gateway.role, "cjs_identity_gateway");
  assert.equal(gateway.sub, "provider:1");
  const get = await auth(
    new Request("https://escala.example/api/auth", {
      headers: { Cookie: cookie },
    }),
    env,
    now,
    { fetchImpl },
  );
  assert.deepEqual((await get.json()).user, { id: userId, name: "Exemplo" });
  assert.equal(
    (await auth(request({ action: "logout" }, cookie), env, now, { fetchImpl }))
      .status,
    200,
  );
  assert.ok(records.some((r) => r.url.endsWith("/revoke_session")));
});
test("login aceita identidade emitida depois do início da requisição", async () => {
  let clock = now;
  const fallback = upstream("unused", []);
  const handler = routes({
    env,
    now: () => clock,
    fetchImpl: async (url, opts) => {
      if (url === env.N8N_LOGIN_URL) {
        clock += 2500;
        const issued = Math.floor(clock / 1000);
        return Response.json({ success: true, token: await sign({ ...claims, iat: issued, exp: issued + 3600 }, env.N8N_JWT_SECRET) });
      }
      return fallback(url, opts);
    },
  });
  const result = await handler(request({ email: "user@example.test", password: "correct-pass" }));
  assert.equal(result.status, 200, await result.clone().text());
  assert.ok(result.headers.get("set-cookie"));
});
test("cookie compartilhado não autentica modo individual, nem libera persistência", async () => {
  const legacy = await issue({ ...env, AUTH_MODE: "shared" }, now);
  assert.equal(await read(`cjs_session=${legacy}`, env, now), null);
  const result = await routes({
    env,
    now: () => now,
    fetchImpl: async () => {
      throw Error("must not fetch");
    },
  })(
    new Request("https://escala.example/api/persistence", {
      method: "POST",
      headers: {
        Origin: "https://escala.example",
        "Content-Type": "application/json",
        Cookie: `cjs_session=${legacy}`,
      },
      body: '{"action":"listOffices"}',
    }),
  );
  assert.equal(result.status, 401);
});
test("token externo inválido não abre sessão e erros do provedor não expõem conteúdo interno", async () => {
  const calls = [];
  const invalid = await sign({ ...claims, aud: "wrong" }, env.N8N_JWT_SECRET);
  const res = await auth(
    request({ email: "a@example.test", password: "correct" }),
    env,
    now,
    { fetchImpl: upstream(invalid, calls) },
  );
  assert.equal(res.status, 401);
  assert.ok(!calls.some((r) => r.url.endsWith("/open_session")));
  const fail = await auth(
    request({ email: "a@example.test", password: "correct" }),
    env,
    now,
    {
      fetchImpl: async () =>
        new Response("secret private SQL", { status: 500 }),
    },
  );
  assert.equal(fail.status, 503);
  assert.ok(!(await fail.text()).includes("private"));
});
test("senha acima de 72 bytes e entradas malformadas não chegam ao n8n", async () => {
  for (const b of [
    { email: "a@example.test", password: "á".repeat(37) },
    { email: [], password: "ok" },
    { email: "a@example.test", password: {} },
    { email: "bad", password: "ok" },
  ]) {
    const r = await auth(request(b), env, now, {
      fetchImpl: async () => {
        throw Error("must not call");
      },
    });
    assert.equal(r.status, 400);
  }
});
test("sessão revogada ou serviço indisponível não são tratados como autenticação válida", async () => {
  const cookie = `cjs_session=${await issue(env, now, { userId, sessionId, expiresAt: now + 3600000 })}`;
  const r = await auth(
    new Request("https://escala.example/api/auth", {
      headers: { Cookie: cookie },
    }),
    env,
    now,
    { fetchImpl: async () => new Response(null, { status: 401 }) },
  );
  assert.equal(r.status, 401);
  const logout = await auth(request({ action: "logout" }, cookie), env, now, {
    fetchImpl: async () => {
      throw Error("offline");
    },
  });
  assert.equal(logout.status, 503);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});
test("modo n8n mal configurado falha fechado e não usa a senha compartilhada", async () => {
  const r = await auth(
    request({ email: "a@example.test", password: "correct" }),
    { ...env, N8N_JWT_SECRET: "" },
    now,
  );
  assert.equal(r.status, 503);
  const config = await auth(
    new Request("https://escala.example/api/auth?config=1"),
    env,
    now,
  );
  assert.deepEqual(await config.json(), { mode: "n8n" });
});
