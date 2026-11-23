const { test } = require("node:test");
const assert = require("node:assert/strict");
const TOKEN = "c".repeat(64), office = "20000000-0000-0000-0000-000000000001", company = "30000000-0000-0000-0000-000000000001";
async function setup(respostas = {}, envExtra = {}) {
  const { createAdminHandler } = await import("../server/admin.js");
  const { issueSession } = await import("../server/auth.js");
  const now = Date.now(), env = {
    AUTH_MODE: "n8n", APP_ORIGIN: "https://reescala.fintria.com.br",
    AUTH_SESSION_SECRET: "invite-unit-cookie-secret-long-enough-x", PERSISTENCE_RPC_URL: "https://rpc.example",
    PERSISTENCE_JWT_SECRET: "invite-unit-rpc-secret-long-enough-xxxx",
    N8N_MAIL_URL: "https://n8n.example/auth/cjs-mail", N8N_SERVICE_SECRET: "service-secret-with-at-least-32-chars", ...envExtra,
  };
  const token = await issueSession(env, now, { userId: "10000000-0000-0000-0000-000000000001", sessionId: "40000000-0000-0000-0000-000000000001", expiresAt: now + 3600000 });
  const chamadas = [];
  const h = createAdminHandler({ env, now: () => now, fetchImpl: async (url, o) => {
    const nome = url.includes("/rpc/") ? url.split("/rpc/")[1] : "mail";
    chamadas.push({ nome, body: JSON.parse(o.body) });
    const r = respostas[nome];
    return typeof r === "function" ? r() : Response.json(r ?? {});
  } });
  const post = (body) => h(new Request("https://reescala.fintria.com.br/api/admin", { method: "POST", headers: { cookie: "cjs_session=" + token, origin: "https://reescala.fintria.com.br", "content-type": "application/json" }, body: JSON.stringify(body) }));
  const get = () => h(new Request("https://reescala.fintria.com.br/api/admin", { headers: { cookie: "cjs_session=" + token } }));
  return { post, get, chamadas };
}
const convite = { action: "inviteUser", name: " Nova Pessoa ", email: " Nova@X.test ", officeId: office, role: "operator", companyIds: [company] };
const resposta = { user: { id: "10000000-0000-0000-0000-000000000099", name: "Nova Pessoa" }, mail: { kind: "invite", token: TOKEN, email: "nova@x.test", name: "Nova Pessoa", officeName: "Escritório A", invitedBy: "Gerente A", expiresMinutes: 10080 } };

test("convite cria o usuário sem senha e envia o link só por e-mail", async () => {
  const t = await setup({ manage_invite_user: resposta });
  const res = await t.post(convite);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, user: resposta.user, emailSent: true });
  assert(!JSON.stringify(body).includes(TOKEN), "link não volta ao navegador");
  assert.deepEqual(t.chamadas[0], { nome: "manage_invite_user", body: { p_name: "Nova Pessoa", p_email: "nova@x.test", p_office_id: office, p_role: "operator", p_company_ids: [company] } });
  assert.deepEqual(t.chamadas[1].body, { app: "Reescala", type: "invite", to: "nova@x.test", name: "Nova Pessoa", officeName: "Escritório A", invitedBy: "Gerente A", expiresMinutes: 10080, loginUrl: "https://reescala.fintria.com.br/login.html", inviteUrl: `https://reescala.fintria.com.br/redefinir-senha.html#token=${TOKEN}` });
});

test("convite valida dados, exige e-mail configurado e informa falha de envio", async () => {
  let t = await setup({ manage_invite_user: resposta });
  for (const ruim of [{ email: "sem-arroba" }, { name: "" }, { role: "viewer" }])
    assert.equal((await t.post({ ...convite, ...ruim })).status, 400);
  assert.equal(t.chamadas.length, 0);
  t = await setup({ manage_invite_user: resposta }, { N8N_MAIL_URL: "" });
  assert.equal((await t.post(convite)).status, 503);
  assert.equal(t.chamadas.length, 0, "sem e-mail configurado não cria a conta");
  t = await setup({ manage_invite_user: resposta, mail: () => new Response("x", { status: 500 }) });
  const erro = console.error; console.error = () => {};
  let res;
  try { res = await t.post(convite); } finally { console.error = erro; }
  assert.equal(res.status, 201);
  assert.equal((await res.json()).emailSent, false);
});

test("reenvio pelo Gerente: convite ou redefinição, sem expor o link", async () => {
  const t = await setup({ manage_send_access_link: { kind: "reset", token: TOKEN, email: "op@x.test", name: "Op", officeName: "Escritório A", invitedBy: "Gerente A", expiresMinutes: 1440 } });
  const res = await t.post({ action: "sendAccessLink", userId: "10000000-0000-0000-0000-000000000004", officeId: office });
  assert.deepEqual(await res.json(), { ok: true, kind: "reset", emailSent: true });
  const mail = t.chamadas.find((c) => c.nome === "mail").body;
  assert.equal(mail.type, "password_reset");
  assert.equal(mail.requestedBy, "Gerente A");
  assert.equal(mail.expiresMinutes, 1440);
  assert.equal((await t.post({ action: "sendAccessLink", userId: "x", officeId: office })).status, 400);
});

test("lista de usuários traz convites pendentes; sem a migração 014, lista vazia", async () => {
  let t = await setup({ manage_options: { users: [], offices: [] }, manage_pending_invites: [{ userId: "u1", expired: false }] });
  let body = await (await t.get()).json();
  assert.deepEqual(body.pendingInvites, [{ userId: "u1", expired: false }]);
  assert.equal(body.invitesEnabled, true);
  t = await setup({ manage_options: { users: [], offices: [] }, manage_pending_invites: () => new Response(JSON.stringify({ code: "PGRST202" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
  body = await (await t.get()).json();
  assert.deepEqual(body.pendingInvites, []);
});

test("Admin global é convidado sem escritório nem empresas", async () => {
  const t = await setup({ manage_invite_user: { ...resposta, mail: { ...resposta.mail, officeName: null } } });
  const res = await t.post({ action: "inviteUser", name: "Novo Admin", email: "admin2@x.test", officeId: null, role: "admin", companyIds: [company] });
  assert.equal(res.status, 201);
  assert.deepEqual(t.chamadas[0].body, { p_name: "Novo Admin", p_email: "admin2@x.test", p_office_id: null, p_role: "admin", p_company_ids: [] });
  assert.equal(t.chamadas[1].body.officeName, "");
  assert.equal((await t.post({ action: "inviteUser", name: "Op", email: "op@x.test", officeId: null, role: "operator", companyIds: [] })).status, 400, "demais perfis exigem escritório");
  const r = await t.post({ action: "sendAccessLink", userId: "10000000-0000-0000-0000-000000000099", officeId: null });
  assert.notEqual(r.status, 400, "reenvio para Admin sem escritório é aceito pela API");
});

test("Admin muda o escritório do usuário (moveUser) com validação", async () => {
  const t = await setup({ manage_move_user: { ok: true, revision: 5, officeId: office } });
  const base = { action: "moveUser", userId: "10000000-0000-0000-0000-000000000004", revision: 4, toOfficeId: office, role: "operator", companyIds: [company] };
  assert.deepEqual(await (await t.post(base)).json(), { ok: true, revision: 5, officeId: office });
  assert.deepEqual(t.chamadas[0], { nome: "manage_move_user", body: { p_user_id: base.userId, p_revision: 4, p_to_office_id: office, p_role: "operator", p_company_ids: [company] } });
  for (const ruim of [{ toOfficeId: null }, { role: "viewer" }, { revision: 0 }, { companyIds: ["x"] }])
    assert.equal((await t.post({ ...base, ...ruim })).status, 400, JSON.stringify(ruim));
  assert.equal((await t.post({ ...base, role: "admin", toOfficeId: null, companyIds: [] })).status, 200, "Admin sem escritório");
  assert.deepEqual(t.chamadas.at(-1).body, { p_user_id: base.userId, p_revision: 4, p_to_office_id: null, p_role: "admin", p_company_ids: [] });
});
