/* /api/account — "Minha conta" no login individual.
 * GET:              nome, e-mail atual e troca de e-mail pendente.
 * name (sessão):    altera o próprio nome.
 * email (sessão):   confere a senha atual e envia o link de confirmação ao endereço novo;
 *                   o e-mail atual continua valendo até a confirmação.
 * confirmEmail:     página pública do link; troca o e-mail e avisa o endereço antigo.
 * O link (token) só passa pelo backend e pelo e-mail; nunca volta ao navegador de quem pediu. */
import { signJwt } from "./jwt.js";
import { createMailer, origemPublica } from "./mail.js";
import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";

const TOKEN = /^[a-f0-9]{64}$/;
const emailValido = (v) => typeof v === "string" && v.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const INDISPONIVEL = "Serviço indisponível. Tente novamente em instantes.";
const SEM_MIGRACAO = "Minha conta ainda não configurada no banco (migração 019).";

export function createAccountHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const mailer = createMailer({ env, fetchImpl });
  const erro = (error, extra = {}) => {
    const msg = { 400: error.message, 401: "Sessão expirada. Entre novamente.", 409: error.message, 429: error.message, 501: SEM_MIGRACAO, ...extra }[error.status];
    return json({ error: msg || INDISPONIVEL }, msg ? error.status : 503);
  };

  // Confirmação sem sessão: papel de serviço (gateway), como na redefinição de senha.
  async function gateway(name, args) {
    const base = env.PERSISTENCE_RPC_URL;
    if (typeof base !== "string" || !base || typeof env.PERSISTENCE_JWT_SECRET !== "string" || env.PERSISTENCE_JWT_SECRET.length < 32)
      throw Object.assign(Error(INDISPONIVEL), { status: 503 });
    const iat = Math.floor(now() / 1000);
    const token = await signJwt({ role: "cjs_identity_gateway", purpose: "identity", sub: "account", iss: "cjs-escala-api", aud: "cjs-postgrest", iat, exp: iat + 60 }, env.PERSISTENCE_JWT_SECRET);
    let res;
    try {
      res = await fetchImpl(`${base.replace(/\/$/, "")}/rpc/${name}`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Content-Profile": "cjs_api" },
        body: JSON.stringify(args),
      });
    } catch {
      throw Object.assign(Error(INDISPONIVEL), { status: 503 });
    }
    if (!res.ok) {
      let detail = {};
      try { detail = await res.json(); } catch {}
      if (res.status === 404 && detail?.code === "PGRST202") throw Object.assign(Error(SEM_MIGRACAO), { status: 501 });
      const msg = { 409: "Este e-mail passou a ser usado por outra conta. Peça a troca novamente com outro endereço.", 410: "Este link é inválido, já foi usado ou expirou. Peça a troca novamente em Minha conta." }[res.status];
      throw Object.assign(Error(msg || INDISPONIVEL), { status: msg ? res.status : 503 });
    }
    return res.json();
  }

  return async (request) => {
    try {
      if (env.AUTH_MODE !== "n8n") return json({ error: "Minha conta disponível apenas no login individual." }, 404);
      const url = new URL(request.url);
      const service = createPersistenceService({ env, fetchImpl, now });
      const sessao = async () => {
        const s = await readSession(request.headers.get("cookie"), env, now());
        return s?.kind === "individual" ? { userId: s.userId, sessionId: s.sessionId, expiresAt: s.exp } : null;
      };
      if (request.method === "GET") {
        const identity = await sessao();
        if (!identity) return json({ error: "Entre com sua conta." }, 401);
        try {
          const r = await service.myAccount(identity);
          return json({ name: r?.name || "", email: r?.email || "", pendingEmail: r?.pendingEmail || null, emailChangeEnabled: mailer.configured() });
        } catch (error) {
          return erro(error);
        }
      }
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      if (request.headers.get("origin") !== url.origin) return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Formato inválido." }, 415);
      const raw = await request.text();
      if (raw.length > 2048) return json({ error: "Requisição muito grande." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Requisição inválida." }, 400); }
      const origem = origemPublica(env, request);

      if (body?.action === "confirmEmail") {
        if (!TOKEN.test(body.token || "")) return json({ error: "Este link é inválido, já foi usado ou expirou. Peça a troca novamente em Minha conta." }, 410);
        let r;
        try { r = await gateway("confirm_email_change", { p_token: body.token }); } catch (error) { return json({ error: error.message }, error.status || 503); }
        // Aviso ao endereço antigo: se não foi a pessoa, ela sabe que precisa agir.
        if (r?.oldEmail)
          await mailer.send({ type: "email_changed", to: r.oldEmail, name: r.name, newEmail: r.newEmail, changedAt: new Date(now()).toISOString(), loginUrl: `${origem}/login.html` });
        return json({ ok: true, email: r?.newEmail || "" });
      }

      const identity = await sessao();
      if (!identity) return json({ error: "Entre com sua conta." }, 401);
      if (body?.action === "name") {
        if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 160) return json({ error: "Informe o nome completo (2 a 160 caracteres)." }, 400);
        try {
          return json({ ok: true, name: (await service.updateOwnName(identity, body.name.trim()))?.name || body.name.trim() });
        } catch (error) {
          return erro(error);
        }
      }
      if (body?.action === "email") {
        if (!emailValido(body.email)) return json({ error: "Informe um e-mail válido." }, 400);
        if (typeof body.current !== "string" || !body.current || body.current.length > 256) return json({ error: "Informe a senha atual." }, 400);
        if (!mailer.configured()) return json({ error: "Envio de e-mails não configurado. Fale com o administrador." }, 503);
        let r;
        try {
          r = await service.requestEmailChange(identity, { email: body.email.trim().toLowerCase(), current: body.current });
        } catch (error) {
          return erro(error);
        }
        if (!r?.ok)
          return json({ error: r?.remaining > 0 ? `Senha atual incorreta. Restam ${r.remaining} tentativa(s) antes de um bloqueio de 15 minutos.` : "Senha atual incorreta. Novas tentativas ficam bloqueadas por 15 minutos." }, 422);
        if (!TOKEN.test(r.token || "")) return json({ error: INDISPONIVEL }, 503);
        const enviado = await mailer.send({
          type: "email_change", to: r.newEmail, name: r.name, currentEmail: r.oldEmail,
          confirmUrl: `${origem}/confirmar-email.html#token=${r.token}`,
          expiresMinutes: r.expiresMinutes || 1440, loginUrl: `${origem}/login.html`,
          requestedAt: new Date(now()).toISOString(),
        });
        if (!enviado) return json({ error: "Não foi possível enviar o e-mail de confirmação agora. Tente novamente em instantes." }, 503);
        return json({ ok: true, pendingEmail: r.newEmail });
      }
      return json({ error: "Operação inválida." }, 400);
    } catch {
      return json({ error: INDISPONIVEL }, 503);
    }
  };
}
