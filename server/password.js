/* /api/password — "Esqueci minha senha" sem sessão.
 * request: gera link de uso único (30 min) e pede ao n8n o envio do e-mail;
 *          a resposta é sempre a mesma, exista ou não a conta.
 * check:   informa se o link ainda vale (para a página de redefinição).
 * reset:   troca a senha (bcrypt no banco), revoga sessões e avisa por e-mail. */
import { signJwt } from "./jwt.js";

export const RESPOSTA_PEDIDO = "Se o e-mail estiver cadastrado e com acesso ativo, enviaremos em instantes um link para criar uma nova senha. O link vale por 30 minutos.";
const TOKEN = /^[a-f0-9]{64}$/;
const emailValido = (v) => typeof v === "string" && v.trim().length <= 254 && /^\S+@\S+\.\S+$/.test(v.trim());
/** Regras da nova senha (as mesmas conferidas no banco). */
export function senhaValida(v) {
  return typeof v === "string" && v.length >= 8 && new TextEncoder().encode(v).length <= 72 && /\p{L}/u.test(v) && /\d/.test(v);
}
class PasswordError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (v) => v.toString(16).padStart(2, "0")).join("");
function endereco(value, allowLocal) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || !(u.protocol === "https:" || (allowLocal === "true" && u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))))
    throw new PasswordError("Recuperação de senha indisponível.", 503);
  return u.href.replace(/\/$/, "");
}

export function createPasswordHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

  function configuracao() {
    for (const k of ["N8N_MAIL_URL", "N8N_SERVICE_SECRET", "PERSISTENCE_RPC_URL", "PERSISTENCE_JWT_SECRET"])
      if (typeof env[k] !== "string" || !env[k]) throw new PasswordError("Recuperação de senha indisponível no momento. Fale com o administrador do seu escritório.", 503);
    if (env.N8N_SERVICE_SECRET.length < 32 || env.PERSISTENCE_JWT_SECRET.length < 32) throw new PasswordError("Recuperação de senha indisponível.", 503);
    return { mail: endereco(env.N8N_MAIL_URL, env.PERSISTENCE_ALLOW_LOCAL_HTTP), rpc: endereco(env.PERSISTENCE_RPC_URL, env.PERSISTENCE_ALLOW_LOCAL_HTTP) };
  }
  async function rpc(base, name, args) {
    const iat = Math.floor(now() / 1000);
    const token = await signJwt({ role: "cjs_identity_gateway", purpose: "identity", sub: "password", iss: "cjs-escala-api", aud: "cjs-postgrest", iat, exp: iat + 60 }, env.PERSISTENCE_JWT_SECRET);
    let res;
    try {
      res = await fetchImpl(`${base}/rpc/${name}`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Content-Profile": "cjs_api" },
        body: JSON.stringify(args),
      });
    } catch {
      throw new PasswordError("Serviço indisponível. Tente novamente em instantes.", 503);
    }
    if (!res.ok) {
      const msg = {
        400: "A senha precisa ter de 8 a 72 caracteres, com letras e números.",
        410: "Este link é inválido, já foi usado ou expirou. Peça um novo.",
        429: "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
      }[res.status];
      throw new PasswordError(msg || "Serviço indisponível. Tente novamente em instantes.", msg ? res.status : 503);
    }
    return res.json();
  }
  /** Pede ao n8n o envio do e-mail. Falha não revela se a conta existe. */
  async function enviar(base, mensagem) {
    try {
      const res = await fetchImpl(base, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json", "X-CJS-Service-Key": env.N8N_SERVICE_SECRET },
        body: JSON.stringify({ app: "Reescala", ...mensagem }),
      });
      if (!res.ok) throw Error(String(res.status));
      return true;
    } catch {
      // Sem dados pessoais no log: só o tipo da mensagem.
      console.error("CJS_MAIL_FAILURE", { type: mensagem.type });
      return false;
    }
  }

  return async (request) => {
    try {
      if (env.AUTH_MODE !== "n8n") return json({ error: "Recuperação de senha disponível apenas no login individual." }, 404);
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      const url = new URL(request.url);
      if (request.headers.get("origin") !== url.origin) return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Formato inválido." }, 415);
      const raw = await request.text();
      if (raw.length > 2048) return json({ error: "Requisição muito grande." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Requisição inválida." }, 400); }
      const cfg = configuracao();
      const origem = (env.APP_ORIGIN || url.origin).replace(/\/$/, "");

      if (body?.action === "request") {
        if (!emailValido(body.email)) return json({ error: "Informe um e-mail válido." }, 400);
        const email = body.email.trim().toLowerCase();
        // Mesmo limite do login: por e-mail (hash) e global.
        await rpc(cfg.rpc, "login_attempt", { p_bucket: await sha256("reset:" + email) });
        const r = await rpc(cfg.rpc, "password_reset_request", { p_email: email });
        if (r?.send === true && TOKEN.test(r.token || ""))
          await enviar(cfg.mail, {
            type: "password_reset", to: r.email, name: r.name,
            resetUrl: `${origem}/redefinir-senha.html#token=${r.token}`,
            expiresMinutes: r.expiresMinutes || 30, loginUrl: `${origem}/login.html`,
            requestedAt: new Date(now()).toISOString(),
          });
        return json({ ok: true, message: RESPOSTA_PEDIDO });
      }
      if (body?.action === "check") {
        if (!TOKEN.test(body.token || "")) return json({ valid: false });
        const r = await rpc(cfg.rpc, "password_reset_check", { p_token: body.token });
        return json({ valid: r?.valid === true, expiresAt: r?.valid ? r.expiresAt : null });
      }
      if (body?.action === "reset") {
        if (!TOKEN.test(body.token || "")) return json({ error: "Este link é inválido, já foi usado ou expirou. Peça um novo." }, 410);
        if (!senhaValida(body.password)) return json({ error: "A senha precisa ter de 8 a 72 caracteres, com letras e números." }, 400);
        await rpc(cfg.rpc, "login_attempt", { p_bucket: await sha256("reset-token:" + body.token) });
        const r = await rpc(cfg.rpc, "password_reset_complete", { p_token: body.token, p_password: body.password });
        await enviar(cfg.mail, {
          type: "password_changed", to: r.email, name: r.name,
          changedAt: new Date(now()).toISOString(), loginUrl: `${origem}/login.html`,
          forgotUrl: `${origem}/login.html#esqueci`,
        });
        return json({ ok: true, sessionsRevoked: r.sessionsRevoked || 0 });
      }
      return json({ error: "Operação inválida." }, 400);
    } catch (error) {
      const status = error instanceof PasswordError ? error.status : 503;
      return json({ error: error instanceof PasswordError ? error.message : "Serviço indisponível. Tente novamente em instantes." }, status);
    }
  };
}
