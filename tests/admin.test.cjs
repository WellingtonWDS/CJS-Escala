const { test } = require("node:test");
const assert = require("node:assert/strict");
test("admin exige allowlist, senha adicional, mesma sessão, origem e expiração", async () => {
  const { createAdminHandler, adminPasswordHash } = await import(
    "../server/admin.js"
  );
  const { issueSession, guard } = await import("../server/auth.js");
  let now = Date.now();
  const userId = "10000000-0000-0000-0000-000000000001",
    sessionId = "40000000-0000-0000-0000-000000000001";
  const env = {
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "test-admin-cookie-key-with-enough-characters",
    ADMIN_USER_IDS: userId,
    ADMIN_PASSWORD_HASH: await adminPasswordHash("admin-test-pass"),
    N8N_LOGIN_URL: "https://identity.example/login",
    N8N_SERVICE_SECRET: "test-service-key-with-enough-characters",
    N8N_JWT_SECRET: "test-identity-key-with-enough-characters",
    N8N_JWT_ISSUER: "identity",
    N8N_JWT_AUDIENCE: "login",
    PERSISTENCE_RPC_URL: "https://rpc.example",
    PERSISTENCE_JWT_SECRET: "test-rpc-key-with-enough-characters",
  };
  const cookie =
    "cjs_session=" +
    (await issueSession(env, now, {
      userId,
      sessionId,
      expiresAt: now + 3600000,
    }));
  const calls = [];
  const handler = createAdminHandler({
    env,
    now: () => now,
    fetchImpl: async (url, opts) => {
      calls.push(url);
      if (url.endsWith("/get_identity"))
        return Response.json({ id: userId, name: "Admin" });
      if (url.endsWith("/login_attempt"))
        return new Response(null, { status: 204 });
      if (url.endsWith("/admin_options"))
        return Response.json({ offices: [], companies: [] });
      if (url.endsWith("/admin_create_user"))
        return Response.json({ id: userId, name: "Novo" });
      throw Error("unexpected");
    },
  });
  const request = (body, cookies = cookie, origin = "https://app.example") =>
    new Request("https://app.example/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookies,
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handler(request(null, ""))).status, 403);
  const outsider =
    "cjs_session=" +
    (await issueSession(env, now, {
      userId: "10000000-0000-0000-0000-000000000002",
      sessionId,
      expiresAt: now + 3600000,
    }));
  assert.equal((await handler(request(null, outsider))).status, 403);
  assert.equal(calls.length, 0);
  assert.deepEqual(await (await handler(request())).json(), {
    unlocked: false,
  });
  assert.equal((await handler(request({ action: "createUser" }))).status, 403);
  assert.equal(
    (await handler(request({ action: "unlock", password: "wrong" }))).status,
    401,
  );
  assert.ok(calls.some((url) => url.endsWith("/login_attempt")));
  assert.equal(
    (
      await handler(
        request(
          { action: "unlock", password: "admin-test-pass" },
          cookie,
          "https://other.example",
        ),
      )
    ).status,
    403,
  );
  const result = await handler(
    request({ action: "unlock", password: "admin-test-pass" }),
  );
  assert.equal(result.status, 200);
  assert.match(
    result.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict; Max-Age=1800; Secure/,
  );
  const both = cookie + "; " + result.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await (await handler(request(null, both))).json()).unlocked,
    true,
  );
  const otherSession =
    "cjs_session=" +
    (await issueSession(env, now, {
      userId,
      sessionId: "40000000-0000-0000-0000-000000000002",
      expiresAt: now + 3600000,
    }));
  assert.equal(
    (
      await (
        await handler(request(null, both.replace(cookie, otherSession)))
      ).json()
    ).unlocked,
    false,
  );
  assert.equal(
    (await guard(new Request("https://app.example/admin.html"), env, now))
      .status,
    404,
  );
  assert.equal(
    await guard(
      new Request("https://app.example/admin.html", {
        headers: { Cookie: cookie },
      }),
      env,
      now,
    ),
    null,
  );
  const fields = {
    action: "createUser",
    name: "Novo",
    email: "novo@example.test",
    password: "123456",
    officeId: "20000000-0000-0000-0000-000000000001",
    role: "editor",
    companyIds: ["30000000-0000-0000-0000-000000000001"],
  };
  assert.equal(
    (await handler(request({ ...fields, password: "12345" }, both))).status,
    400,
  );
  assert.equal((await handler(request(fields, both))).status, 201);
  now += 1800001;
  assert.equal((await handler(request(fields, both))).status, 403);
});
