import { readSession, issueSession } from "./auth.js";
import { createIdentityService } from "./identity-service.js";
import { signJwt } from "./jwt.js";

const COOKIE = "cjs_admin";
const TTL = 30 * 60 * 1000;
export function isPlatformAdmin(session, env) {
  return (
    env.AUTH_MODE === "n8n" &&
    session?.kind === "individual" &&
    (env.ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .includes(session.userId)
  );
}
const adminEnv = (env) => ({
  ...env,
  AUTH_SESSION_SECRET: `${env.AUTH_SESSION_SECRET}:admin-access-v1`,
});
export async function adminPasswordHash(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode("cjs-admin-access-v1"),
      iterations: 210000,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export function createAdminHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...headers,
      },
    });
  return async (request) => {
    try {
      const session = await readSession(
        request.headers.get("cookie"),
        env,
        now(),
      );
      if (!isPlatformAdmin(session, env))
        return json({ error: "Acesso não autorizado." }, 403);
      if (!/^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH || ""))
        return json(
          { error: "Área administrativa ainda não configurada." },
          503,
        );
      // A sessão normal deve continuar ativa no banco, inclusive após revogação.
      const identity = createIdentityService(env, { fetchImpl, now });
      await identity.getIdentity(session);
      const cookieEnv = adminEnv(env);
      const adminCookie = (request.headers.get("cookie") || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${COOKIE}=`));
      const unlocked = await readSession(
        adminCookie?.replace(`${COOKIE}=`, "cjs_session="),
        cookieEnv,
        now(),
      );
      const allowed =
        unlocked?.userId === session.userId &&
        unlocked?.sessionId === session.sessionId;
      const cookie = (value, seconds) =>
        `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
      if (request.method === "GET") {
        if (!allowed) return json({ unlocked: false });
        return json({
          unlocked: true,
          ...(await rpc("admin_options", {}, session)),
        });
      }
      if (request.method !== "POST")
        return json({ error: "Método não permitido." }, 405);
      if (request.headers.get("origin") !== new URL(request.url).origin)
        return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return json({ error: "Formato inválido." }, 415);
      const raw = await request.text();
      if (raw.length > 4096)
        return json({ error: "Requisição muito grande." }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "JSON inválido." }, 400);
      }
      if (body?.action === "lock")
        return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
      if (body?.action === "unlock") {
        if (typeof body.password !== "string" || body.password.length > 256)
          return json({ error: "Senha administrativa inválida." }, 400);
        await identity.adminAttempt(session.userId);
        const actual = await adminPasswordHash(body.password);
        let mismatch = 0;
        for (let i = 0; i < 64; i++)
          mismatch |=
            actual.charCodeAt(i) ^ env.ADMIN_PASSWORD_HASH.charCodeAt(i);
        if (mismatch)
          return json({ error: "Senha administrativa incorreta." }, 401);
        const exp = Math.min(session.exp, now() + TTL);
        const token = await issueSession(cookieEnv, now(), {
          userId: session.userId,
          sessionId: session.sessionId,
          expiresAt: exp,
        });
        return json({ ok: true }, 200, {
          "Set-Cookie": cookie(
            token,
            Math.max(0, Math.floor((exp - now()) / 1000)),
          ),
        });
      }
      if (!allowed)
        return json(
          { error: "Informe a senha administrativa novamente." },
          403,
        );
      if (body?.action !== "createUser")
        return json({ error: "Operação inválida." }, 400);
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 160 ||
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(body.email.trim()) ||
        typeof body.password !== "string" ||
        [...body.password].length < 6 ||
        new TextEncoder().encode(body.password).length > 72 ||
        !["admin", "editor", "viewer"].includes(body.role) ||
        !/^[a-f0-9-]{36}$/i.test(body.officeId || "") ||
        !Array.isArray(body.companyIds) ||
        body.companyIds.some(
          (id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id),
        )
      )
        return json(
          {
            error:
              "Confira os dados. A senha deve ter ao menos 6 caracteres e no máximo 72 bytes.",
          },
          400,
        );
      const result = await rpc(
        "admin_create_user",
        {
          p_name: body.name.trim(),
          p_email: body.email.trim().toLowerCase(),
          p_password: body.password,
          p_office_id: body.officeId,
          p_role: body.role,
          p_company_ids: body.companyIds,
        },
        session,
      );
      return json({ ok: true, user: result }, 201);
    } catch (error) {
      const status = [400, 401, 403, 409, 429].includes(error.status)
        ? error.status
        : 503;
      return json(
        {
          error:
            status === 409
              ? "Já existe uma conta com esse e-mail."
              : status === 429
                ? "Muitas tentativas. Aguarde 15 minutos."
                : status === 400
                  ? "Confira o escritório e as empresas selecionadas."
                  : "Não foi possível concluir a operação administrativa.",
        },
        status,
      );
    }
  };
  async function rpc(name, body, session) {
    const url = new URL(env.PERSISTENCE_RPC_URL);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          env.PERSISTENCE_ALLOW_LOCAL_HTTP === "true" &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        ))
    )
      throw Error("Invalid endpoint");
    const iat = Math.floor(now() / 1000);
    const token = await signJwt(
      {
        role: "cjs_admin_gateway",
        purpose: "admin",
        iss: "cjs-escala-api",
        aud: "cjs-postgrest",
        sub: session.userId,
        sid: session.sessionId,
        iat,
        exp: Math.min(iat + 60, Math.floor(session.exp / 1000)),
      },
      env.PERSISTENCE_JWT_SECRET,
    );
    const response = await fetchImpl(
      `${url.href.replace(/\/$/, "")}/rpc/${name}`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "Content-Profile": "cjs_api",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok)
      throw Object.assign(Error("Admin RPC failed"), {
        status: response.status,
      });
    return response.json();
  }
}
