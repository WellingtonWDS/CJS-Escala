import bcrypt from "bcryptjs";
import { signJwt, verifyIdentityJwt } from "./jwt.js";
// Hash de referência para gastar o mesmo tempo quando o e-mail não existe.
const HASH_FICTICIO = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.mXHM0bU7Tq7dBMmV9mNt0c3qFyVu";
export class IdentityError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
function endpoint(value, allowLocal) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !(
      u.protocol === "https:" ||
      (allowLocal === "true" &&
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    )
  )
    throw new IdentityError("Endereço do serviço inválido.");
  return u.href.replace(/\/$/, "");
}
export function createIdentityService(
  env,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  for (const k of [
    "N8N_LOGIN_URL",
    "N8N_SERVICE_SECRET",
    "N8N_JWT_SECRET",
    "N8N_JWT_ISSUER",
    "N8N_JWT_AUDIENCE",
    "PERSISTENCE_JWT_SECRET",
  ])
    if (typeof env[k] !== "string" || !env[k])
      throw new IdentityError("Login individual não configurado.");
  if (
    env.N8N_JWT_SECRET.length < 32 ||
    env.PERSISTENCE_JWT_SECRET.length < 32 ||
    env.N8N_SERVICE_SECRET.length < 32 ||
    env.N8N_JWT_SECRET === env.PERSISTENCE_JWT_SECRET
  )
    throw new IdentityError("Chaves de autenticação inválidas.");
  const loginUrl = endpoint(
      env.N8N_LOGIN_URL,
      env.PERSISTENCE_ALLOW_LOCAL_HTTP,
    ),
    rpcUrl = endpoint(
      env.PERSISTENCE_RPC_URL,
      env.PERSISTENCE_ALLOW_LOCAL_HTTP,
    );
  async function rpc(name, claims, args = {}) {
    const iat = Math.floor(now() / 1000),
      token = await signJwt(
        {
          iss: "cjs-escala-api",
          aud: "cjs-postgrest",
          iat,
          exp: iat + 60,
          ...claims,
        },
        env.PERSISTENCE_JWT_SECRET,
      );
    let response;
    try {
      response = await fetchImpl(`${rpcUrl}/rpc/${name}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Profile": "cjs_api",
        },
        body: JSON.stringify(args),
      });
    } catch {
      throw new IdentityError("Serviço de sessão indisponível.");
    }
    if (!response.ok) {
      if (response.status === 404) {
        let erro;
        try { erro = await response.clone().json(); } catch {}
        if (erro?.code === "PGRST202") throw Object.assign(new IdentityError("Serviço de sessão indisponível."), { ausente: true });
      }
      const messages = {
        401: "Sessão expirada ou revogada.",
        403: "Usuário sem acesso ao sistema.",
        429: "Muitas tentativas. Aguarde 15 minutos.",
      };
      throw new IdentityError(
        messages[response.status] || "Serviço de sessão indisponível.",
        messages[response.status] ? response.status : 503,
      );
    }
    return response.status === 204 ? null : response.json();
  }
  const gateway = (subject) => ({
    role: "cjs_identity_gateway",
    purpose: "identity",
    sub: subject,
  });
  const actor = (s) => ({
    role: "cjs_authenticated",
    sub: s.userId,
    sid: s.sessionId,
    exp: Math.min(Math.floor(s.exp / 1000), Math.floor(now() / 1000) + 60),
  });
  return {
    async login(email, password) {
      if (
        typeof email !== "string" ||
        email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(email.trim()) ||
        typeof password !== "string" ||
        !password ||
        new TextEncoder().encode(password).length > 72
      )
        throw new IdentityError("Informe e-mail e senha válidos.", 400);
      email = email.trim().toLowerCase();
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(email),
          ),
        ),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      await rpc("login_attempt", gateway("login"), { p_bucket: hash });
      // Login direto (migração 021): o banco entrega o hash só ao backend e a senha é
      // conferida aqui, fora da VPS. Sem a migração, segue o fluxo do n8n.
      const direto = await loginDireto(email, password);
      if (direto) return direto;
      let r;
      try {
        r = await fetchImpl(loginUrl, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            "X-CJS-Service-Key": env.N8N_SERVICE_SECRET,
          },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        throw new IdentityError("Serviço de login indisponível.");
      }
      if (!r.ok) {
        if ([400, 401, 403].includes(r.status))
          throw new IdentityError("E-mail ou senha inválidos.", 401);
        throw new IdentityError("Serviço de login indisponível.");
      }
      let data;
      try {
        data = await r.json();
      } catch {
        throw new IdentityError("Resposta de login inválida.");
      }
      if (data.success === false)
        throw new IdentityError("E-mail ou senha inválidos.", 401);
      let verified;
      try {
        verified = await verifyIdentityJwt(
          data.token ?? data.data?.token,
          env,
          now(),
        );
      } catch {
        throw new IdentityError(
          "Não foi possível validar a identidade recebida.",
          401,
        );
      }
      return abrirSessao(verified.subject, verified.expiresAt);
    },
    getIdentity: (s) => rpc("get_identity", actor(s)),
    revoke: (s) => rpc("revoke_session", actor(s)),
  };
  async function loginDireto(email, password) {
    let r;
    try {
      r = await rpc("login_lookup", gateway("login"), { p_email: email });
    } catch (error) {
      // Função ausente (migração 021 não aplicada): usa o n8n.
      if (error.status === 404 || error.ausente) return null;
      throw error;
    }
    const encontrado = r?.found === true && typeof r.hash === "string" && /^[0-9a-f-]{36}$/i.test(r.userId || "");
    const valido = await bcrypt.compare(password, encontrado ? r.hash : HASH_FICTICIO);
    if (!encontrado || !valido) throw new IdentityError("E-mail ou senha inválidos.", 401);
    return abrirSessao(r.userId, now() + 43200000);
  }
  async function abrirSessao(subject, expiresAt) {
      const result = await rpc("open_session", gateway(subject), {
        p_expires_at: new Date(expiresAt).toISOString(),
      });
      const uuid = (v) =>
        typeof v === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          v,
        );
      if (
        !uuid(result?.userId) ||
        !uuid(result?.sessionId) ||
        !Number.isSafeInteger(result?.expiresAt) ||
        result.expiresAt <= now() ||
        result.expiresAt > now() + 43200000
      )
        throw new IdentityError("Resposta de sessão inválida.");
      return result;
  }
}
