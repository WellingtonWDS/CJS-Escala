const { test } = require("node:test");
const assert = require("node:assert/strict");
const TOKEN = "b".repeat(64);
const env = {
  AUTH_MODE: "n8n",
  APP_ORIGIN: "https://reescala.fintria.com.br",
  N8N_MAIL_URL: "https://n8n.example/auth/cjs-mail",
  N8N_SERVICE_SECRET: "service-secret-with-at-least-32-chars",
  PERSISTENCE_RPC_URL: "https://rpc.example",
  PERSISTENCE_JWT_SECRET: "rpc-secret-with-at-least-32-characters",
  AUTH_SESSION_SECRET: "account-cookie-secret-long-enough-xx",
};
const erroRpc = (status, message) => () => new Response(JSON.stringify({ message }), { status, headers: { "Content-Type": "application/json" } });
async function setup(respostas = {}, extraEnv = {}) {
  const { createAccountHandler } = await import("../server/account.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now();
  const cookie = "cjs_session=" + await issueSession({ ...env, ...extraEnv }, now, { userId: "10000000-0000-0000-0000-000000000083", sessionId: "40000000-0000-0000-0000-000000000083", expiresAt: now + 3600000 });
  const chamadas = [];
  const h = createAccountHandler({
    env: { ...env, ...extraEnv },
    fetchImpl: async (url, o) => {
      const nome = url.includes("/rpc/") ? url.split("/rpc/")[1] : "mail";
      chamadas.push({ nome, body: JSON.parse(o.body || "null"), headers: o.headers });
      const r = respostas[nome];
      if (typeof r === "function") return r();
      return Response.json(r ?? null);
    },
  });
  const post = (body, headers = { cookie }) =>
    h(new Request("https://reescala.fintria.com.br/api/account", { method: "POST", headers: { origin: "https://reescala.fintria.com.br", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  const get = (headers = { cookie }) => h(new Request("https://reescala.fintria.com.br/api/account", { headers }));
  return { post, get, chamadas };
}

test("minha conta: consulta e edita o próprio nome com a sessão", async () => {
  const t = await setup({ my_account: { name: "Pessoa", email: "p@x.test", pendingEmail: null }, update_own_name: { name: "Pessoa Nova" } });
  assert.equal((await t.get({})).status, 401);
  assert.deepEqual(await (await t.get()).json(), { name: "Pessoa", email: "p@x.test", pendingEmail: null, emailChangeEnabled: true });
  assert.equal((await t.post({ action: "name", name: "x" })).status, 400);
  assert.equal((await t.post({ action: "name", name: "Pessoa Nova" }, {})).status, 401);
  const res = await t.post({ action: "name", name: "  Pessoa Nova " });
  assert.deepEqual(await res.json(), { ok: true, name: "Pessoa Nova" });
  assert.deepEqual(t.chamadas.at(-1).body, { p_name: "Pessoa Nova" });
  assert.equal(JSON.parse(Buffer.from(t.chamadas.at(-1).headers.Authorization.split(".")[1], "base64url")).sub, "10000000-0000-0000-0000-000000000083");
});

test("troca de e-mail: senha atual, link só para o endereço novo e nunca de volta ao navegador", async () => {
  let resposta = { ok: true, token: TOKEN, newEmail: "novo@x.test", oldEmail: "p@x.test", name: "Pessoa", expiresMinutes: 1440 };
  const t = await setup({ request_email_change: () => (typeof resposta === "function" ? resposta() : Response.json(resposta)) });
  assert.equal((await t.post({ action: "email", email: "ruim", current: "SenhaAtual1" })).status, 400);
  assert.equal((await t.post({ action: "email", email: "novo@x.test", current: "" })).status, 400);
  assert.equal(t.chamadas.length, 0);
  let res = await t.post({ action: "email", email: " Novo@X.test ", current: "SenhaAtual1" });
  const corpo = await res.json();
  assert.deepEqual(corpo, { ok: true, pendingEmail: "novo@x.test" });
  assert(!JSON.stringify(corpo).includes(TOKEN), "o link não volta para quem pediu");
  assert.deepEqual(t.chamadas[0].body, { p_new_email: "novo@x.test", p_password: "SenhaAtual1" });
  const mail = t.chamadas.find((c) => c.nome === "mail").body;
  assert.equal(mail.type, "email_change");
  assert.equal(mail.to, "novo@x.test");
  assert.equal(mail.currentEmail, "p@x.test");
  assert.equal(mail.confirmUrl, `https://reescala.fintria.com.br/confirmar-email.html#token=${TOKEN}`);
  assert(!JSON.stringify(mail).includes("SenhaAtual1"), "senha nunca vai para o n8n");
  resposta = { ok: false, reason: "senha_atual", remaining: 2 };
  res = await t.post({ action: "email", email: "novo@x.test", current: "Errada1" });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Restam 2/);
  resposta = erroRpc(409, "Este e-mail já está em uso em outra conta.");
  res = await t.post({ action: "email", email: "ocupado@x.test", current: "SenhaAtual1" });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /já está em uso/);
  // Sem envio de e-mails configurado, nem chega ao banco.
  const semMail = await setup({}, { N8N_MAIL_URL: "" });
  res = await semMail.post({ action: "email", email: "novo@x.test", current: "SenhaAtual1" });
  assert.equal(res.status, 503);
  assert.equal(semMail.chamadas.length, 0);
});

test("confirmação pelo link: sem sessão, papel de serviço e aviso ao endereço antigo", async () => {
  let resposta = { oldEmail: "p@x.test", newEmail: "novo@x.test", name: "Pessoa" };
  const t = await setup({ confirm_email_change: () => (typeof resposta === "function" ? resposta() : Response.json(resposta)) });
  assert.equal((await t.post({ action: "confirmEmail", token: "xyz" }, {})).status, 410);
  let res = await t.post({ action: "confirmEmail", token: TOKEN }, {});
  assert.deepEqual(await res.json(), { ok: true, email: "novo@x.test" });
  const rpc = t.chamadas.find((c) => c.nome === "confirm_email_change");
  const claims = JSON.parse(Buffer.from(rpc.headers.Authorization.split(".")[1], "base64url"));
  assert.equal(claims.role, "cjs_identity_gateway");
  assert.equal(claims.purpose, "identity");
  const mail = t.chamadas.find((c) => c.nome === "mail").body;
  assert.deepEqual([mail.type, mail.to, mail.newEmail], ["email_changed", "p@x.test", "novo@x.test"]);
  resposta = erroRpc(410, "Link inválido ou expirado.");
  res = await t.post({ action: "confirmEmail", token: TOKEN }, {});
  assert.equal(res.status, 410);
  assert.match((await res.json()).error, /inválido, já foi usado ou expirou/);
  // Origem diferente é recusada.
  const outro = await t.post({ action: "confirmEmail", token: TOKEN }, { origin: "https://evil.example" });
  assert.equal(outro.status, 403);
});

test("n8n monta os e-mails de troca de e-mail com links do domínio público", async () => {
  const { readFile } = require("node:fs/promises");
  const code = await readFile(require("node:path").join(__dirname, "../integrations/n8n/montar-email.js"), "utf8");
  const rodar = (body) => Function("$json", `return (async () => {${code}})();`)({ body });
  const base = { to: "novo@x.test", name: "Ana <b>", loginUrl: "https://reescala.fintria.com.br/login.html" };
  const [pedido] = await rodar({ ...base, type: "email_change", currentEmail: "p@x.test", confirmUrl: `https://reescala.fintria.com.br/confirmar-email.html#token=${TOKEN}`, expiresMinutes: 1440 });
  assert.equal(pedido.json.valid, true);
  assert.equal(pedido.json.subject, "Confirme seu novo e-mail no Reescala");
  assert.match(pedido.json.html, /Confirmar novo e-mail/);
  assert.match(pedido.json.html, /<strong>1 dia<\/strong>/);
  assert.match(pedido.json.text, /confirmar-email\.html#token=b{64}/);
  const [avisado] = await rodar({ ...base, to: "p@x.test", type: "email_changed", newEmail: "novo@x.test", changedAt: "2026-11-23T15:04:00Z" });
  assert.equal(avisado.json.valid, true);
  assert.match(avisado.json.html, /<strong>novo@x\.test<\/strong>/);
  for (const ruim of [{ type: "email_change", confirmUrl: "https://evil.example/x" }, { type: "email_changed", newEmail: "<x>" }]) {
    const [r] = await rodar({ ...base, ...ruim });
    assert.equal(r.json.valid, false);
  }
});
