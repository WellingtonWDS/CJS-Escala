const { test } = require("node:test");
const assert = require("node:assert/strict");
const env = {
  APP_ORIGIN: "https://reescala.fintria.com.br", N8N_MAIL_URL: "https://n8n.example/auth/cjs-mail",
  N8N_SERVICE_SECRET: "service-secret-with-at-least-32-chars", PERSISTENCE_RPC_URL: "https://rpc.example",
  PERSISTENCE_JWT_SECRET: "rpc-secret-with-at-least-32-characters",
};
const pendentes = [
  { id: "n1", kind: "plano_80", details: { used: 4, capacity: 5 }, officeName: "Contabilidade Alfa", companyName: null, plan: { name: "Inicial", used: 4, capacity: 5, free: 1, cycleStart: "2026-11-19", renewsAt: "2026-12-19" }, recipients: [{ email: "g1@x.test", name: "Gerente Um" }, { email: "g2@x.test", name: "Gerente Dois" }] },
  { id: "n2", kind: "troca", details: { novos: 6, total: 8, actor: "Operador A" }, officeName: "Contabilidade Alfa", companyName: "Padaria", plan: { name: "Inicial", used: 4, capacity: 5, free: 1, renewsAt: "2026-12-19" }, recipients: [{ email: "g1@x.test", name: "Gerente Um" }] },
];
function fakeFetch({ falharPara = null, rpc404 = false } = {}) {
  const chamadas = [];
  const impl = async (url, o) => {
    const body = JSON.parse(o.body);
    if (url.includes("/rpc/")) {
      const nome = url.split("/rpc/")[1];
      chamadas.push({ nome, body, auth: o.headers.Authorization });
      if (rpc404) return new Response(JSON.stringify({ code: "PGRST202" }), { status: 404 });
      return Response.json(nome === "plan_notices_pending" ? pendentes : { sent: body.p_ids.length });
    }
    chamadas.push({ nome: "mail", body });
    return body.to === falharPara ? new Response("x", { status: 500 }) : new Response(null, { status: 202 });
  };
  return { impl, chamadas };
}

test("envia um e-mail por Gerente e marca só os avisos entregues", async () => {
  const { dispatchNotices } = await import("../server/notices.js");
  const f = fakeFetch({ falharPara: "g2@x.test" });
  const erro = console.error; console.error = () => {};
  let r;
  try { r = await dispatchNotices({ env, fetchImpl: f.impl, origem: env.APP_ORIGIN }); } finally { console.error = erro; }
  assert.deepEqual(r, { sent: 1, failed: 1 });
  const mails = f.chamadas.filter((c) => c.nome === "mail").map((c) => c.body);
  assert.deepEqual(mails.map((m) => [m.kind, m.to]), [["plano_80", "g1@x.test"], ["plano_80", "g2@x.test"], ["troca", "g1@x.test"]]);
  assert.deepEqual({ ...mails[2], app: undefined }, { app: undefined, type: "plan_notice", kind: "troca", to: "g1@x.test", name: "Gerente Um", officeName: "Contabilidade Alfa", companyName: "Padaria", planName: "Inicial", used: 4, capacity: 5, free: 1, cycleStart: "", renewsAt: "2026-12-19", freed: 0, novos: 6, total: 8, actor: "Operador A", appUrl: "https://reescala.fintria.com.br/#empresas", loginUrl: "https://reescala.fintria.com.br/login.html" });
  assert.deepEqual(f.chamadas.find((c) => c.nome === "plan_notices_done").body, { p_ids: ["n2"] }, "aviso com falha fica para nova tentativa");
  const claims = JSON.parse(Buffer.from(f.chamadas[0].auth.split(" ")[1].split(".")[1], "base64url"));
  assert.equal(claims.role, "cjs_identity_gateway");
});

test("sem e-mail configurado ou sem a migração 018, nada é enviado", async () => {
  const { dispatchNotices } = await import("../server/notices.js");
  let f = fakeFetch();
  assert.equal((await dispatchNotices({ env: { ...env, N8N_MAIL_URL: "" }, fetchImpl: f.impl, origem: "x" })).skipped, true);
  assert.equal(f.chamadas.length, 0);
  f = fakeFetch({ rpc404: true });
  assert.equal((await dispatchNotices({ env, fetchImpl: f.impl, origem: "x" })).skipped, true);
});

test("/api/notices exige a chave do serviço", async () => {
  const { createNoticesHandler } = await import("../server/notices.js");
  const f = fakeFetch();
  const h = createNoticesHandler({ env, fetchImpl: f.impl });
  const req = (chave, method = "POST") => new Request("https://reescala.fintria.com.br/api/notices", { method, headers: chave ? { "x-cjs-service-key": chave } : {} });
  assert.equal((await h(req(null))).status, 401);
  assert.equal((await h(req("errada-errada-errada-errada-errada-x"))).status, 401);
  assert.equal((await h(req(env.N8N_SERVICE_SECRET, "GET"))).status, 405);
  const res = await h(req(env.N8N_SERVICE_SECRET));
  assert.deepEqual(await res.json(), { ok: true, sent: 2, failed: 0 });
});

test("fluxos n8n: e-mails dos quatro avisos e agendamento diário protegido", async () => {
  const { readFile } = require("node:fs/promises");
  const wf = JSON.parse(await readFile(new URL("../integrations/n8n/cjs-mail.template.json", `file://${__filename}`), "utf8"));
  const code = wf.nodes.find((n) => n.name === "Montar e-mail").parameters.jsCode;
  const rodar = async (body) => (await Function("$json", `return (async () => {${code}})();`)({ body }))[0].json;
  const base = { type: "plan_notice", to: "g1@x.test", name: "Gerente <Um>", officeName: "Contabilidade Alfa", planName: "Inicial", used: 4, capacity: 5, free: 1, renewsAt: "2026-12-19", appUrl: "https://reescala.fintria.com.br/#empresas", loginUrl: "https://reescala.fintria.com.br/login.html" };
  const esperados = { plano_80: /perto do limite/, plano_100: /limite do plano foi atingido/, troca: /Troca de quadro aguardando/, ciclo: /ciclo foi renovado/ };
  for (const [kind, re] of Object.entries(esperados)) {
    const m = await rodar({ ...base, kind, companyName: "Padaria <B>", novos: 6, total: 8, actor: "Operador A", freed: 2 });
    assert.equal(m.valid, true, kind);
    assert.match(m.html, re, kind);
    assert.match(m.html, /Abrir o Reescala/);
    assert(!m.html.includes("<Um>") && !m.html.includes("Padaria <B>"), "dados escapados");
    assert(m.text.length > 40);
  }
  assert.match((await rodar({ ...base, kind: "plano_80" })).html, /4 de 5 empresas/);
  assert.match((await rodar({ ...base, kind: "troca", companyName: "Padaria", novos: 6, total: 8 })).html, /6 de 8 colaboradores novos/);
  assert.match((await rodar({ ...base, kind: "ciclo", freed: 2 })).html, /2 vaga\(s\)<\/strong> de empresas arquivadas/);
  assert.equal((await rodar({ ...base, kind: "outro" })).valid, false);
  assert.equal((await rodar({ ...base, kind: "plano_80", appUrl: "https://evil.example" })).valid, false);
  const diario = JSON.parse(await readFile(new URL("../integrations/n8n/cjs-avisos-diarios.template.json", `file://${__filename}`), "utf8"));
  assert.equal(diario.active, false);
  const http = diario.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.parameters.url, "https://reescala.fintria.com.br/api/notices");
  assert.equal(http.parameters.genericAuthType, "httpHeaderAuth");
  assert.equal(diario.settings.timezone, "America/Sao_Paulo");
});

test("código do nó Montar e-mail em arquivo próprio é idêntico ao do fluxo", async () => {
  const { readFile } = require("node:fs/promises");
  const wf = JSON.parse(await readFile(new URL("../integrations/n8n/cjs-mail.template.json", `file://${__filename}`), "utf8"));
  const arquivo = await readFile(new URL("../integrations/n8n/montar-email.js", `file://${__filename}`), "utf8");
  assert.equal(arquivo.trimEnd(), wf.nodes.find((n) => n.name === "Montar e-mail").parameters.jsCode.trimEnd());
});
