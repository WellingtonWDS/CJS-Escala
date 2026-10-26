const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
let token, service, handler, client;
const now = Date.now(),
  identity = {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: now + 43200000,
  };
const env = {
  PERSISTENCE_ENABLED: "true",
  PERSISTENCE_RPC_URL: "https://api.example.test",
  PERSISTENCE_JWT_SECRET: "test-secret-32-characters-minimum-long",
};
before(async () => {
  ({ rpcToken: token, createPersistenceService: service } = await import(
    "../server/services/persistence.js"
  ));
  ({ createPersistenceHandler: handler } = await import(
    "../server/persistence-api.js"
  ));
  ({ createRemotePersistence: client } = await import(
    "../assets/js/services/persistence.js"
  ));
});
const request = (body, headers = {}) =>
  new Request("https://escala.example/api/persistence", {
    method: "POST",
    headers: {
      Origin: "https://escala.example",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("JWT de RPC é curto, vinculado à sessão e tem papel e público fixos", () => {
  const t = token(identity, env.PERSISTENCE_JWT_SECRET, now),
    [h, p, s] = t.split("."),
    claims = JSON.parse(Buffer.from(p, "base64url"));
  assert.equal(claims.exp - claims.iat, 60);
  assert.equal(claims.sub, identity.userId);
  assert.equal(claims.sid, identity.sessionId);
  assert.equal(claims.role, "cjs_authenticated");
  assert.equal(claims.aud, "cjs-postgrest");
  assert.equal(claims.iss, "cjs-escala-api");
  assert.equal(
    s,
    createHmac("sha256", env.PERSISTENCE_JWT_SECRET)
      .update(`${h}.${p}`)
      .digest("base64url"),
  );
  const short = JSON.parse(
    Buffer.from(
      token(
        { ...identity, expiresAt: now + 2000 },
        env.PERSISTENCE_JWT_SECRET,
        now,
      ).split(".")[1],
      "base64url",
    ),
  );
  assert.ok(short.exp <= Math.floor((now + 2000) / 1000));
});
test("sessão expirada, identidade incompleta e chave ausente não geram JWT", () => {
  for (const i of [
    null,
    {},
    { ...identity, userId: "admin" },
    { ...identity, expiresAt: now },
  ])
    assert.throws(() => token(i, env.PERSISTENCE_JWT_SECRET, now));
  assert.throws(() => token(identity, "", now));
});
test("API nega ausência de autenticador mesmo com cookie legado, Bearer e identidade no corpo", async () => {
  let called = false;
  const h = handler({
    env,
    fetchImpl: async () => {
      called = true;
    },
  });
  const res = await h(
    request(
      { action: "listOffices", userId: identity.userId },
      { Cookie: "cjs_session=fake", Authorization: "Bearer fake" },
    ),
  );
  assert.equal(res.status, 401);
  assert.equal(called, false);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
});
test("persistência desativada não chama a VPS", async () => {
  let called = false;
  const res = await handler({
    env: { ...env, PERSISTENCE_ENABLED: "false" },
    authenticate: async () => identity,
    fetchImpl: async () => {
      called = true;
    },
  })(request({ action: "listOffices" }));
  assert.equal(res.status, 503);
  assert.equal(called, false);
});
test("origem, formato, operação, UUID e carga inválidos são rejeitados antes da rede", async () => {
  let calls = 0;
  const h = handler({
    env,
    authenticate: async () => identity,
    fetchImpl: async () => {
      calls++;
    },
  });
  assert.equal(
    (
      await h(
        request({ action: "listOffices" }, { Origin: "https://evil.example" }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h(
        request({ action: "listOffices" }, { "Content-Type": "text/plain" }),
      )
    ).status,
    415,
  );
  for (const b of [
    [],
    null,
    { action: "__proto__" },
    { action: "arbitrary_sql" },
    { action: "listCompanies", officeId: "not-uuid" },
    {
      action: "saveDraft",
      officeId: identity.userId,
      companyId: identity.userId,
      key: identity.userId,
      title: "",
      state: {},
    },
  ])
    assert.equal((await h(request(b))).status, 400);
  assert.equal(
    (await h(request({ action: "listOffices", padding: "x".repeat(1100000) })))
      .status,
    413,
  );
  assert.equal(calls, 0);
});
test("identidade fornecida no corpo nunca substitui a identidade autenticada no servidor", async () => {
  let sent;
  const h = handler({
    env,
    authenticate: async () => identity,
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return Response.json([]);
    },
  });
  const res = await h(
    request({
      action: "listOffices",
      userId: "outro",
      sessionId: "outra",
      role: "postgres",
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(sent.url, "https://api.example.test/rpc/list_offices");
  const c = JSON.parse(
    Buffer.from(sent.options.headers.Authorization.split(".")[1], "base64url"),
  );
  assert.equal(c.sub, identity.userId);
  assert.equal(c.role, "cjs_authenticated");
  assert.equal(sent.options.redirect, "error");
  assert.equal(sent.options.headers["Content-Profile"], "cjs_api");
});
test("somente HTTPS ou loopback explicitamente autorizado pode ser usado", () => {
  for (const url of [
    "http://api.example.test",
    "file:///tmp/x",
    "https://user:pass@api.example.test",
    "https://api.example.test/?key=secret",
  ])
    assert.throws(() => service({ env: { ...env, PERSISTENCE_RPC_URL: url } }));
  assert.doesNotThrow(() =>
    service({
      env: {
        ...env,
        PERSISTENCE_RPC_URL: "http://127.0.0.1:3000",
        PERSISTENCE_ALLOW_LOCAL_HTTP: "true",
      },
    }),
  );
});
test("falhas remotas não expõem mensagens SQL, segredos ou resposta de proxy", async () => {
  const s = service({
    env,
    fetchImpl: async () =>
      new Response("password=hidden internal SQL", { status: 500 }),
  });
  await assert.rejects(
    () => s.listOffices(identity),
    (e) => e.status === 503 && !e.message.includes("hidden"),
  );
  const offline = service({
    env,
    fetchImpl: async () => {
      throw Error("jwt=hidden");
    },
  });
  await assert.rejects(
    () => offline.listOffices(identity),
    (e) => e.status === 503 && !e.message.includes("hidden"),
  );
  const conflict = service({
    env,
    fetchImpl: async () => new Response("", { status: 409 }),
  });
  await assert.rejects(
    () => conflict.listOffices(identity),
    (e) => e.status === 409,
  );
});
test("serviço de frontend usa a mesma origem e distingue conflito de sucesso", async () => {
  let options;
  const c = client({
    fetchImpl: async (url, o) => {
      assert.equal(url, "/api/persistence");
      options = o;
      return Response.json({ id: "saved", revision: 1 });
    },
  });
  assert.equal((await c.saveDraft({ title: "Teste", state: {} })).revision, 1);
  assert.equal(options.credentials, "same-origin");
  assert.equal(JSON.parse(options.body).action, "saveDraft");
  const fail = client({
    fetchImpl: async () =>
      Response.json({ error: "Conflito" }, { status: 409 }),
  });
  await assert.rejects(
    () => fail.listOffices(),
    (e) => e.status === 409,
  );
});
