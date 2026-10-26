const { test } = require("node:test");
const assert = require("node:assert/strict");

test("adaptador Vercel informa modo e diagnostica falhas sem expor segredos", async () => {
  const { handleVercel } = await import("../server/vercel-adapter.js");
  const names = ["APP_ORIGIN", "AUTH_MODE", "AUTH_SESSION_SECRET"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalError = console.error;
  const logs = [];
  const response = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  });
  try {
    process.env.APP_ORIGIN = "https://app.example";
    process.env.AUTH_SESSION_SECRET = "test-only-cookie-secret-with-enough-characters";
    console.error = (...args) => logs.push(args);
    for (const mode of ["shared", "n8n"]) {
      process.env.AUTH_MODE = mode;
      const res = response();
      await handleVercel({ method: "GET", url: "/api/auth?config=1", headers: { host: "app.example" } }, res, "/api/auth");
      assert.equal(res.statusCode, 200);
      assert.deepEqual(JSON.parse(res.body), { mode });
    }
    process.env.APP_ORIGIN = "invalid-origin-sensitive-value";
    const res = response();
    await handleVercel({ method: "GET", url: "/api/auth?config=1", headers: {} }, res, "/api/auth");
    assert.equal(res.statusCode, 503);
    assert.equal(res.body, "Serviço indisponível.");
    assert.deepEqual(logs, [["CJS_API_FAILURE", { route: "/api/auth", stage: "request-url" }]]);
    assert.ok(!JSON.stringify(logs).includes(process.env.APP_ORIGIN));
  } finally {
    console.error = originalError;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
