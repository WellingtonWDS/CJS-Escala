const { test } = require("node:test");
const assert = require("node:assert/strict");
test("CNPJ numérico e alfanumérico, formatação e busca por nome/documento", async () => {
  const { validCnpj, normalizeCnpj, formatCnpj, matchesCompany, companyLabel } =
    await import("../assets/js/shared/empresas.js");
  for (const value of [
    "48.956.412/0001-26",
    "11.222.333/0001-81",
    "12.ABC.345/01DE-35",
  ])
    assert.equal(validCnpj(value), true, value);
  for (const value of [
    "",
    "00000000000000",
    "11111111111111",
    "11.222.333/0001-82",
    "12.ABC.345/01DE-36",
    "48x956.412/0001-26",
  ])
    assert.equal(validCnpj(value), false, value);
  assert.equal(normalizeCnpj("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(formatCnpj("48956412000126"), "48.956.412/0001-26");
  const row = { name: "Comércio José", cnpj: "48956412000126" };
  for (const term of ["comercio", "josé", "48956412", "48.956.412/0001-26"])
    assert.equal(matchesCompany(row, term), true, term);
  assert.equal(matchesCompany(row, "Outra loja"), false);
  assert.match(companyLabel(row), /Comércio José — 48\.956/);
});
test("cadastro de empresa exige sessão, origem, CNPJ válido e corpo controlado", async () => {
  const { createCompaniesHandler } = await import("../server/companies.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now(),
    env = {
      AUTH_MODE: "n8n",
      AUTH_SESSION_SECRET: "test-cookie-key-with-enough-characters",
      PERSISTENCE_RPC_URL: "https://rpc.example",
      PERSISTENCE_JWT_SECRET: "test-rpc-key-with-enough-characters",
    };
  const token = await issueSession(env, now, {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: now + 3600000,
  });
  const calls = [];
  const handler = createCompaniesHandler({
    env,
    now: () => now,
    fetchImpl: async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return Response.json({ status: "created", company: { id: "fake" } });
    },
  });
  const req = (
    body,
    cookie = "cjs_session=" + token,
    origin = "https://app.example",
  ) =>
    new Request("https://app.example/api/companies", {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handler(req(null, ""))).status, 401);
  assert.equal(calls.length, 0);
  const fields = {
    officeId: "20000000-0000-0000-0000-000000000001",
    name: "Empresa exemplo",
    cnpj: "48.956.412/0001-26",
    apply: true,
  };
  assert.equal(
    (await handler(req(fields, undefined, "https://other.example"))).status,
    403,
  );
  assert.equal(
    (await handler(req({ ...fields, cnpj: "00000000000000" }))).status,
    400,
  );
  assert.equal((await handler(req({ ...fields, apply: "true" }))).status, 400);
  assert.equal(
    (await handler(req({ ...fields, role: "admin", userId: "fake" }))).status,
    200,
  );
  assert.equal(calls[0].url, "https://rpc.example/rpc/resolve_company");
  assert.ok(!("role" in calls[0].body));
  assert.equal(calls[0].body.p_apply, true);
});
