const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pbkdf2Sync } = require("node:crypto");
const env = {
  AUTH_SESSION_SECRET: "test-only-secret-32-characters-long",
  AUTH_PASSWORD_HASH: pbkdf2Sync(
    "test-password",
    "cjs-escala-login-v1",
    210000,
    32,
    "sha256",
  ).toString("hex"),
};
const load = () => import("../server/auth.js");
function request(body, extra = {}) {
  return new Request("https://example.com/api/auth", {
    method: "POST",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
test("senha, cookie seguro e sessão fixa de 12h, sem renovação na consulta", async () => {
  const { authResponse, SESSION_MS } = await load();
  const now = Date.now();
  assert.equal(
    (await authResponse(request({ password: "incorrect" }), env, now)).status,
    401,
  );
  const login = await authResponse(
    request({ password: "test-password" }),
    env,
    now,
  );
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  for (const attr of [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=43200",
    "Path=/",
  ])
    assert.ok(cookie.includes(attr));
  const query = new Request("https://example.com/api/auth", {
    headers: { Cookie: cookie },
  });
  const active = await authResponse(query, env, now + SESSION_MS - 1);
  assert.equal((await active.json()).expiresAt, now + SESSION_MS);
  assert.equal(active.headers.get("set-cookie"), null);
  assert.equal((await authResponse(query, env, now + SESSION_MS)).status, 401);
  const logout = await authResponse(request({ action: "logout" }), env, now);
  assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
});
test("token adulterado, inválido, futuro, segredo trocado e ausência de configuração bloqueiam", async () => {
  const { issueSession, readSession, guard } = await load();
  const now = Date.now();
  const token = await issueSession(env, now);
  assert.ok(await readSession("cjs_session=" + token, env, now));
  for (const value of [token + "x", "garbage", "a.b.c"])
    assert.equal(await readSession("cjs_session=" + value, env, now), null);
  assert.equal(await readSession("cjs_session=" + token, env, now - 1), null);
  assert.equal(
    await readSession(
      "cjs_session=" + token,
      { AUTH_SESSION_SECRET: "another-test-secret-32-characters-long" },
      now,
    ),
    null,
  );
  assert.equal(
    (await guard(new Request("https://example.com/"), {})).status,
    503,
  );
});
test("páginas e módulos exigem sessão; login público; redirect externo e origem indevida bloqueados", async () => {
  const { guard, authResponse, safeNext } = await load();
  for (const path of [
    "/",
    "/index.html",
    "/assets/js/app.js",
    "/assets/js/main.js",
    "/assets/js/data/nomes.json",
  ])
    assert.equal(
      (await guard(new Request("https://example.com" + path), env)).status,
      303,
    );
  assert.equal(
    await guard(new Request("https://example.com/login.html"), env),
    null,
  );
  assert.equal(
    (
      await authResponse(
        request({ password: "test-password" }, { Origin: "https://evil.test" }),
        env,
      )
    ).status,
    403,
  );
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login.html",
    "/api/auth",
  ])
    assert.equal(safeNext(path), "/");
  assert.equal(safeNext("/?foo=1#etapa-2"), "/?foo=1#etapa-2");
  assert.equal(
    (
      await authResponse(
        new Request("https://example.com/api/auth", { method: "DELETE" }),
        env,
      )
    ).status,
    405,
  );
});

test("adaptadores da Vercel aplicam proteção e emitem o cookie de login", async () => {
  const original = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
  };
  Object.assign(process.env, env);
  try {
    const { default: middleware } = await import("../middleware.js");
    assert.equal(
      (await middleware(new Request("https://example.com/"))).status,
      303,
    );
    assert.equal(
      (
        await middleware(new Request("https://example.com/login.html"))
      ).headers.get("cache-control"),
      "private, no-store",
    );
    const { default: handler } = await import("../api/auth.js");
    const result = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await handler(
      {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "https://example.com",
          "content-type": "application/json",
        },
        body: { password: "test-password" },
      },
      result,
    );
    assert.equal(result.statusCode, 200);
    assert.ok(result.headers["set-cookie"].includes("Secure"));
    assert.equal(
      JSON.parse(result.body).expiresAt - JSON.parse(result.body).serverNow,
      12 * 60 * 60 * 1000,
    );
  } finally {
    for (const [name, value] of Object.entries(original))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
