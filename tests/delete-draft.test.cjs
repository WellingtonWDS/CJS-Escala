const { test } = require("node:test");
const assert = require("node:assert/strict");
test("exclusão local remove somente o cache escolhido e fecha apenas se for o atual", async () => {
  const { createWorkspace } = await import("../assets/js/state/workspace.js");
  const { createDefaultState } = await import("../assets/js/state/store.js");
  const data = new Map(),
    raw = {
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  const user = "10000000-0000-0000-0000-000000000001",
    other = "10000000-0000-0000-0000-000000000002",
    officeId = "20000000-0000-0000-0000-000000000001",
    companyId = "30000000-0000-0000-0000-000000000001";
  const a = {
      officeId,
      companyId,
      draftId: "50000000-0000-0000-0000-000000000001",
      revision: 1,
    },
    b = { ...a, draftId: "50000000-0000-0000-0000-000000000002" },
    workspace = createWorkspace(raw, user),
    otherUser = createWorkspace(raw, other),
    state = createDefaultState();
  workspace.activate(a, state);
  workspace.setPending({ key: "pending" });
  workspace.activate(b, state);
  otherUser.activate(a, state);
  assert.equal(workspace.forgetDraft(a), false);
  assert.equal(workspace.context().draftId, b.draftId);
  assert.equal(workspace.cached(a), null);
  assert.ok(otherUser.cached(a));
  assert.ok(workspace.cached(b));
  assert.equal(workspace.forgetDraft(b), true);
  assert.equal(workspace.context(), null);
  assert.equal(createWorkspace(raw, user).context(), null);
  assert.ok(otherUser.context());
  assert.throws(() => workspace.forgetDraft({ ...a, draftId: null }));
});
test("API de exclusão exige revisão, origem, sessão e encaminha identidade do servidor", async () => {
  const { createPersistenceHandler } = await import(
    "../server/persistence-api.js"
  );
  const identity = {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: Date.now() + 3600000,
  };
  const calls = [];
  const env = {
    PERSISTENCE_ENABLED: "true",
    PERSISTENCE_RPC_URL: "https://rpc.example",
    PERSISTENCE_JWT_SECRET: "test-rpc-key-with-enough-characters",
  };
  const handler = createPersistenceHandler({
    env,
    authenticate: async () => identity,
    fetchImpl: async (url, opts) => {
      calls.push({
        url,
        body: JSON.parse(opts.body),
        claims: JSON.parse(
          Buffer.from(opts.headers.Authorization.split(".")[1], "base64url"),
        ),
      });
      return Response.json({
        id: "50000000-0000-0000-0000-000000000001",
        deleted: true,
      });
    },
  });
  const body = {
    action: "deleteDraft",
    officeId: "20000000-0000-0000-0000-000000000001",
    companyId: "30000000-0000-0000-0000-000000000001",
    draftId: "50000000-0000-0000-0000-000000000001",
    revision: 2,
    userId: "forged",
    role: "postgres",
  };
  const req = (b, origin = "https://app.example") =>
    new Request("https://app.example/api/persistence", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
  assert.equal(
    (await handler(req({ ...body, revision: undefined }))).status,
    400,
  );
  assert.equal((await handler(req({ ...body, revision: 0 }))).status, 400);
  assert.equal((await handler(req(body, "https://other.example"))).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await handler(req(body))).status, 200);
  assert.equal(calls[0].url, "https://rpc.example/rpc/delete_draft");
  assert.deepEqual(calls[0].body, {
    p_office_id: body.officeId,
    p_company_id: body.companyId,
    p_draft_id: body.draftId,
    p_revision: 2,
  });
  assert.equal(calls[0].claims.sub, identity.userId);
  assert.equal(calls[0].claims.role, "cjs_authenticated");
  assert.equal(
    (await createPersistenceHandler({ env })(req(body))).status,
    401,
  );
});
