const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const TOKEN = "a".repeat(64);
const env = {
  AUTH_MODE: "n8n",
  APP_ORIGIN: "https://reescala.fintria.com.br",
  N8N_MAIL_URL: "https://n8n.example/auth/cjs-mail",
  N8N_SERVICE_SECRET: "service-secret-with-at-least-32-chars",
  PERSISTENCE_RPC_URL: "https://rpc.example",
  PERSISTENCE_JWT_SECRET: "rpc-secret-with-at-least-32-characters",
};
async function setup(respostas = {}) {
  const { createPasswordHandler } = await import("../server/password.js");
  const chamadas = [];
  const h = createPasswordHandler({
    env: { ...env, ...(respostas.env || {}) },
    fetchImpl: async (url, o) => {
      const nome = url.includes("/rpc/") ? url.split("/rpc/")[1] : "mail";
      chamadas.push({ nome, body: JSON.parse(o.body), headers: o.headers });
      const r = respostas[nome];
      if (typeof r === "function") return r();
      return Response.json(r ?? null);
    },
  });
  const post = (body, extra = {}) =>
    h(new Request("https://reescala.fintria.com.br/api/password", { method: "POST", headers: { origin: "https://reescala.fintria.com.br", "content-type": "application/json", ...extra }, body: JSON.stringify(body) }));
  return { post, chamadas, h };
}

test("pedido de link: resposta igual com ou sem conta; e-mail só para conta elegível", async () => {
  const { RESPOSTA_PEDIDO } = await import("../server/password.js");
  let t = await setup({ password_reset_request: { send: false } });
  let res = await t.post({ action: "request", email: "ninguem@x.test" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).message, RESPOSTA_PEDIDO);
  assert.deepEqual(t.chamadas.map((c) => c.nome), ["login_attempt", "password_reset_request"]);
  t = await setup({ password_reset_request: { send: true, token: TOKEN, email: "gerente@x.test", name: "Gerente Teste", expiresMinutes: 30 } });
  res = await t.post({ action: "request", email: " Gerente@X.test " });
  assert.equal((await res.json()).message, RESPOSTA_PEDIDO);
  assert.equal(t.chamadas[1].body.p_email, "gerente@x.test");
  const mail = t.chamadas.find((c) => c.nome === "mail");
  assert.equal(mail.headers["X-CJS-Service-Key"], env.N8N_SERVICE_SECRET);
  assert.deepEqual({ ...mail.body, requestedAt: undefined }, { app: "Reescala", type: "password_reset", to: "gerente@x.test", name: "Gerente Teste", resetUrl: `https://reescala.fintria.com.br/redefinir-senha.html#token=${TOKEN}`, expiresMinutes: 30, loginUrl: "https://reescala.fintria.com.br/login.html", requestedAt: undefined });
  // Falha no n8n não revela a existência da conta.
  t = await setup({ password_reset_request: { send: true, token: TOKEN, email: "g@x.test", name: "G" }, mail: () => new Response("x", { status: 500 }) });
  const erro = console.error; console.error = () => {};
  try { res = await t.post({ action: "request", email: "g@x.test" }); } finally { console.error = erro; }
  assert.equal(res.status, 200);
  // Limite de tentativas vem do banco.
  t = await setup({ login_attempt: () => new Response("{}", { status: 429 }) });
  assert.equal((await t.post({ action: "request", email: "g@x.test" })).status, 429);
});

test("entrada, origem, modo e configuração são conferidos antes do banco", async () => {
  const t = await setup();
  assert.equal((await t.post({ action: "request", email: "sem-arroba" })).status, 400);
  assert.equal((await t.post({ action: "request", email: "a@b.test" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await t.post({ action: "reset", token: "curto", password: "Senha1234" })).status, 410);
  assert.equal((await t.post({ action: "reset", token: TOKEN, password: "semnumero" })).status, 400);
  assert.equal((await t.post({ action: "reset", token: TOKEN, password: "1234567" })).status, 400);
  assert.equal((await t.post({ action: "outra" })).status, 400);
  assert.equal(t.chamadas.length, 0);
  const shared = await setup({ env: { AUTH_MODE: "shared" } });
  assert.equal((await shared.post({ action: "request", email: "a@b.test" })).status, 404);
  const semN8n = await setup({ env: { N8N_MAIL_URL: "" } });
  assert.equal((await semN8n.post({ action: "request", email: "a@b.test" })).status, 503);
});

test("redefinição: troca, aviso por e-mail e link expirado", async () => {
  let t = await setup({ password_reset_check: { valid: true, expiresAt: "2026-11-23T12:30:00Z" }, password_reset_complete: { email: "g@x.test", name: "G", sessionsRevoked: 2 } });
  assert.deepEqual(await (await t.post({ action: "check", token: TOKEN })).json(), { valid: true, expiresAt: "2026-11-23T12:30:00Z" });
  const res = await t.post({ action: "reset", token: TOKEN, password: "NovaSenha2026" });
  assert.deepEqual(await res.json(), { ok: true, sessionsRevoked: 2 });
  const complete = t.chamadas.find((c) => c.nome === "password_reset_complete");
  assert.deepEqual(complete.body, { p_token: TOKEN, p_password: "NovaSenha2026" });
  const mail = t.chamadas.find((c) => c.nome === "mail");
  assert.equal(mail.body.type, "password_changed");
  assert.equal(mail.body.forgotUrl, "https://reescala.fintria.com.br/login.html#esqueci");
  assert(!JSON.stringify(mail.body).includes("NovaSenha2026"), "senha nunca vai para o n8n");
  t = await setup({ password_reset_complete: () => new Response("{}", { status: 410 }) });
  const expirado = await t.post({ action: "reset", token: TOKEN, password: "NovaSenha2026" });
  assert.equal(expirado.status, 410);
  assert.match((await expirado.json()).error, /expirou/);
  assert.equal((await t.post({ action: "check", token: "x" })).status, 200);
});

test("fluxo n8n de e-mails: webhook protegido e HTML seguro para os dois tipos", async () => {
  const wf = JSON.parse(await readFile(new URL("../integrations/n8n/cjs-mail.template.json", `file://${__filename}`), "utf8"));
  assert.equal(wf.active, false);
  assert.deepEqual(wf.pinData, {});
  assert.equal(wf.settings.saveDataSuccessExecution, "none");
  assert.equal(wf.settings.saveDataErrorExecution, "none");
  const webhook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(webhook.parameters.authentication, "headerAuth");
  assert.equal(webhook.parameters.path, "auth/cjs-mail");
  const envio = wf.nodes.find((n) => n.type === "n8n-nodes-base.emailSend");
  assert.equal(envio.parameters.emailFormat, "both");
  assert.equal(envio.parameters.options.appendAttribution, false);
  assert(!JSON.stringify(wf).includes("$env"));
  const code = wf.nodes.find((n) => n.name === "Montar e-mail").parameters.jsCode;
  const rodar = (body) => Function("$json", `return (async () => {${code}})();`)({ body });
  const base = { to: "gerente@x.test", name: "<b>Ana</b> Souza", loginUrl: "https://reescala.fintria.com.br/login.html" };
  const [reset] = await rodar({ ...base, type: "password_reset", resetUrl: `https://reescala.fintria.com.br/redefinir-senha.html#token=${TOKEN}`, expiresMinutes: 30 });
  assert.equal(reset.json.valid, true);
  assert.equal(reset.json.subject, "Redefinição de senha do Reescala");
  assert.match(reset.json.html, /^<!DOCTYPE html>/);
  assert(reset.json.html.includes(`redefinir-senha.html#token=${TOKEN}`));
  assert(reset.json.html.includes("Olá, &lt;b&gt;Ana&lt;/b&gt;."), "nome escapado");
  assert(!reset.json.html.includes("<b>Ana"));
  assert.match(reset.json.html, /30 minutos/);
  assert.match(reset.json.text, /redefinir-senha\.html#token=a{64}/);
  const [mudou] = await rodar({ ...base, type: "password_changed", changedAt: "2026-11-23T15:04:00Z", forgotUrl: "https://reescala.fintria.com.br/login.html#esqueci" });
  assert.equal(mudou.json.subject, "Sua senha do Reescala foi alterada");
  assert.match(mudou.json.html, /23\/11\/2026, 12:04/);
  assert.match(mudou.json.html, /login\.html#esqueci/);
  for (const ruim of [{ type: "spam" }, { type: "password_reset", resetUrl: "https://evil.example/x" }, { type: "password_changed", to: "x" }, { type: "password_changed", loginUrl: "javascript:alert(1)" }]) {
    const [r] = await rodar({ ...base, ...ruim });
    assert.equal(r.json.valid, false, JSON.stringify(ruim));
  }
});
