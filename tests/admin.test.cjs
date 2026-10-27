const { test } = require("node:test");
const assert = require("node:assert/strict");
test("gestão usa sessão normal, verifica origem e encaminha apenas operações permitidas", async () => {
  const { createAdminHandler } = await import("../server/admin.js");
  const { issueSession, guard } = await import("../server/auth.js");
  const now = Date.now(),
    userId = "10000000-0000-0000-0000-000000000001",
    sessionId = "40000000-0000-0000-0000-000000000001";
  const env = {
    AUTH_MODE: "n8n",
    AUTH_SESSION_SECRET: "test-cookie-key-with-enough-characters",
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
      const payload = JSON.parse(opts.body);
      const claims = JSON.parse(
        Buffer.from(opts.headers.Authorization.split(".")[1], "base64url"),
      );
      assert.equal(claims.role, "cjs_authenticated");
      assert.equal(claims.sub, userId);
      assert.equal(claims.sid, sessionId);
      calls.push({ url, payload });
      if (url.endsWith("manage_options"))
        return Response.json({
          offices: [],
          companies: [],
          users: [],
          platformAdmin: false,
        });
      if (url.endsWith("manage_create_user"))
        return Response.json({ id: userId, name: payload.p_name });
      return Response.json({ ok: true });
    },
  });
  const req = (body, cookies = cookie, origin = "https://app.example") =>
    new Request("https://app.example/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookies,
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handler(req(null, ""))).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await handler(req())).status, 200);
  const fields = {
    action: "createUser",
    name: "Novo",
    email: "novo@example.test",
    password: "123456",
    role: "operator",
    officeId: "20000000-0000-0000-0000-000000000001",
    companyIds: ["30000000-0000-0000-0000-000000000001"],
  };
  assert.equal(
    (await handler(req(fields, cookie, "https://other.example"))).status,
    403,
  );
  assert.equal(
    (await handler(req({ ...fields, password: "12345" }))).status,
    400,
  );
  assert.equal(
    (await handler(req({ ...fields, role: "superuser" }))).status,
    400,
  );
  assert.equal(
    (await handler(req({ ...fields, action: "unlock" }))).status,
    400,
  );
  assert.equal(
    (await handler(req({ ...fields, userId: "fake", platformAdmin: true })))
      .status,
    201,
  );
  assert.ok(!("platformAdmin" in calls.at(-1).payload));
  assert.equal(
    (
      await handler(
        req({ ...fields, action: "updateAccess", userId, companyIds: [] }),
      )
    ).status,
    200,
  );
  assert.equal(calls.at(-1).payload.p_user_id, userId);
  const update = {
    action: "updateUser",
    userId,
    officeId: fields.officeId,
    revision: 1,
    name: "Editado",
    email: "editado@example.test",
    role: "operator",
    active: true,
    accountActive: true,
    companyIds: [],
  };
  for (const patch of [
    { revision: 0 },
    { active: "true" },
    { role: "owner" },
    { email: "invalid" },
    { userId: "invalid" },
    { officeId: undefined },
  ])
    assert.equal((await handler(req({ ...update, ...patch }))).status, 400);
  assert.equal(
    (await handler(req({ ...update, platformAdmin: true, actorId: "forged" })))
      .status,
    200,
  );
  assert.ok(calls.at(-1).url.endsWith("manage_update_user"));
  assert.equal(calls.at(-1).payload.p_user_id, userId);
  assert.ok(!("platformAdmin" in calls.at(-1).payload));
  assert.equal(
    (await handler(req({ ...update, officeId: null, email: null }))).status,
    200,
  );
  const redirect = await guard(
    new Request("https://app.example/admin.html"),
    env,
    now,
  );
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get("location"), "/#usuarios");
});
