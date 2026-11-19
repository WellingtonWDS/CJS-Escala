const { test } = require("node:test");
const assert = require("node:assert/strict");
const office = "20000000-0000-0000-0000-000000000001",
  company = "30000000-0000-0000-0000-000000000001";
async function setup(respond) {
  const { createPlansHandler } = await import("../server/plans.js");
  const { createPersistenceHandler } = await import("../server/persistence-api.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now(),
    env = {
      AUTH_MODE: "n8n",
      PERSISTENCE_ENABLED: "true",
      AUTH_SESSION_SECRET: "plans-unit-cookie-secret-long-enough-x",
      PERSISTENCE_RPC_URL: "https://rpc.example",
      PERSISTENCE_JWT_SECRET: "plans-unit-rpc-secret-long-enough-xxxx",
    };
  const identity = {
    userId: "10000000-0000-0000-0000-000000000001",
    sessionId: "40000000-0000-0000-0000-000000000001",
    expiresAt: now + 3600000,
  };
  const token = await issueSession(env, now, identity);
  const calls = [];
  const fetchImpl = async (url, o) => {
    const name = url.split("/rpc/")[1], args = JSON.parse(o.body);
    calls.push({ name, args });
    return respond(name, args);
  };
  const handler = createPlansHandler({ env, now: () => now, fetchImpl });
  const persistence = createPersistenceHandler({ env, now: () => now, fetchImpl, authenticate: async () => identity });
  const req = (path, body, extra = {}) =>
    new Request("https://app.example" + path, body === undefined
      ? { headers: { cookie: "cjs_session=" + token, ...extra } }
      : { method: "POST", headers: { cookie: "cjs_session=" + token, origin: "https://app.example", "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  return { handler, persistence, req, calls };
}

test("API de planos exige sessão individual, origem e dados válidos", async () => {
  const { handler, req, calls } = await setup(() => Response.json({ status: "liberado" }));
  assert.equal((await handler(new Request("https://app.example/api/plans?action=overview"))).status, 401);
  const use = { action: "use", officeId: office, companyId: company, use: "gerar", names: ["Ana"] };
  assert.equal((await handler(req("/api/plans", use, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handler(req("/api/plans", { ...use, use: "apagar" }))).status, 400);
  assert.equal((await handler(req("/api/plans", { ...use, names: "Ana" }))).status, 400);
  assert.equal((await handler(req("/api/plans", { ...use, companyId: "x" }))).status, 400);
  assert.equal((await handler(req("/api/plans", { action: "savePlan", officeId: office, revision: null, name: "P", companyLimit: 0, employeeLimit: 50, cycleAnchor: "2026-11-19", status: "ativo" }))).status, 400);
  assert.equal(calls.length, 0);
  const ok = await handler(req("/api/plans", { ...use, names: ["  Ana ", "", 7, "Bruno"], userId: "outro" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0], { name: "plan_register_use", args: { p_office_id: office, p_company_id: company, p_action: "gerar", p_names: ["Ana", "Bruno"], p_confirm_swap: false } });
});

test("painel do Admin e ações chamam somente as funções previstas", async () => {
  const { handler, req, calls } = await setup(() => Response.json({ ok: true }));
  assert.equal((await handler(req("/api/plans?action=overview"))).status, 200);
  assert.equal((await handler(req(`/api/plans?action=detail&officeId=${office}`))).status, 200);
  assert.equal((await handler(req("/api/plans", { action: "savePlan", officeId: office, revision: null, name: " Inicial ", companyLimit: 5, employeeLimit: 50, cycleAnchor: "2026-11-19", status: "ativo", notes: "" }))).status, 200);
  assert.equal((await handler(req("/api/plans", { action: "courtesy", officeId: office, quantity: 1, reason: "teste" }))).status, 200);
  assert.equal((await handler(req("/api/plans", { action: "archive", officeId: office, companyId: company, archived: true }))).status, 200);
  assert.deepEqual(calls.map((c) => c.name), ["admin_plans_overview", "admin_plan_detail", "admin_plan_save", "admin_plan_courtesy", "company_set_archived"]);
  assert.equal(calls[2].args.p_name, "Inicial");
});

test("mensagens próprias do plano são repassadas; demais erros ficam genéricos", async () => {
  let status = 402;
  const { handler, req } = await setup(() => new Response(JSON.stringify({ code: "PT402", message: "Sem vaga livre no plano para reativar a empresa." }), { status, headers: { "Content-Type": "application/json" } }));
  const body = { action: "archive", officeId: office, companyId: company, archived: false };
  let res = await handler(req("/api/plans", body));
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /Sem vaga livre/);
  status = 403;
  res = await handler(req("/api/plans", body));
  assert.equal(res.status, 403);
  assert.doesNotMatch((await res.json()).error, /PT403/);
});

test("sem a migração 010 o uso é liberado sem limite", async () => {
  const { handler, req } = await setup(() => new Response(JSON.stringify({ code: "PGRST202", message: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  const res = await handler(req("/api/plans", { action: "use", officeId: office, companyId: company, use: "gerar", names: [] }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "liberado");
});

test("salvar confere o plano com os nomes do próprio preenchimento", async () => {
  let decision = { status: "confirmar_troca", message: "4 de 4 colaboradores são novos." };
  const { persistence, req, calls } = await setup((name) =>
    Response.json(name === "plan_register_use" ? decision : { id: "50000000-0000-4000-8000-000000000001", revision: 1 }));
  const body = { action: "saveDraft", officeId: office, companyId: company, key: "60000000-0000-4000-8000-000000000001", title: "T", state: { colaboradores: [{ nome: "Ana" }, { nome: "Bruno" }] } };
  let res = await persistence(req("/api/persistence", body));
  assert.equal(res.status, 428);
  assert.match((await res.json()).error, /novos/);
  assert.deepEqual(calls.map((c) => c.name), ["plan_register_use"]);
  assert.deepEqual(calls[0].args.p_names, ["Ana", "Bruno"]);
  assert.equal(calls[0].args.p_action, "salvar");
  decision = { status: "bloqueado", reason: "arquivada", message: "Empresa arquivada: somente visualização." };
  res = await persistence(req("/api/persistence", body));
  assert.equal(res.status, 423);
  decision = { status: "aviso" };
  res = await persistence(req("/api/persistence", body));
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1).name, "save_draft");
});
