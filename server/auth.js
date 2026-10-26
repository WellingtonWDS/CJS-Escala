import { createIdentityService, IdentityError } from "./identity-service.js";
const encoder = new TextEncoder();
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const COOKIE = "cjs_session";
const DEFAULT_HASH =
  "03666e69d982bd4107f125554045e14a11f87e7c0f7b6926561dbd8d298714c1";
const headers = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
};
export function configured(env) {
  return (
    typeof env.AUTH_SESSION_SECRET === "string" &&
    env.AUTH_SESSION_SECRET.length >= 32
  );
}
async function key(env) {
  if (!configured(env)) throw new Error("AUTH_SESSION_SECRET não configurada");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decode(value) {
  if (!/^[\w-]+$/.test(value)) throw new Error("Token inválido");
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function passwordMatches(password, env) {
  if (typeof password !== "string" || password.length > 256) return false;
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode("cjs-escala-login-v1"),
      iterations: 210000,
    },
    material,
    256,
  );
  const actual = Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const expected = env.AUTH_PASSWORD_HASH || DEFAULT_HASH;
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export async function issueSession(env, now = Date.now(), identity = null) {
  const payload = encode(
    encoder.encode(
      JSON.stringify({
        iat: now,
        exp: identity
          ? Math.min(identity.expiresAt, now + SESSION_MS)
          : now + SESSION_MS,
        ...(identity
          ? {
              kind: "individual",
              userId: identity.userId,
              sessionId: identity.sessionId,
            }
          : {}),
        nonce: crypto.randomUUID(),
      }),
    ),
  );
  const signature = encode(
    await crypto.subtle.sign("HMAC", await key(env), encoder.encode(payload)),
  );
  return `${payload}.${signature}`;
}
export async function readSession(cookie, env, now = Date.now()) {
  try {
    const token = cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1);
    if (!token || token.length > 2048) return null;
    const parts = token.split(".");
    if (
      parts.length !== 2 ||
      !(await crypto.subtle.verify(
        "HMAC",
        await key(env),
        decode(parts[1]),
        encoder.encode(parts[0]),
      ))
    )
      return null;
    const value = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return Number.isSafeInteger(value.iat) &&
      value.iat <= now &&
      Number.isSafeInteger(value.exp) &&
      (env.AUTH_MODE === "n8n"
        ? value.kind === "individual" &&
          /^[a-f0-9-]{36}$/i.test(value.userId) &&
          /^[a-f0-9-]{36}$/i.test(value.sessionId) &&
          value.exp > value.iat &&
          value.exp <= value.iat + SESSION_MS
        : !value.kind && value.exp === value.iat + SESSION_MS) &&
      now < value.exp
      ? value
      : null;
  } catch {
    return null;
  }
}
export function publicPath(path) {
  return [
    "/login.html",
    "/assets/css/login.css",
    "/assets/js/login.js",
    "/assets/js/session.js",
    "/assets/js/ui/dialogs.js",
    "/api/auth",
  ].includes(path);
}
export function safeNext(value) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/login.html") &&
    !value.startsWith("/api/")
    ? value
    : "/";
}
export async function guard(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (publicPath(url.pathname)) return null;
  if (url.pathname === "/admin.html")
    return new Response(null, {
      status: 303,
      headers: { Location: "/#usuarios", "Cache-Control": "no-store" },
    });
  if (env.AUTH_MODE && !["shared", "n8n"].includes(env.AUTH_MODE))
    return new Response("Autenticação indisponível.", { status: 503 });
  if (!configured(env))
    return new Response(
      "Acesso indisponível: configure AUTH_SESSION_SECRET na hospedagem.",
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  if (await readSession(request.headers.get("cookie"), env, now)) return null;
  if (url.pathname.startsWith("/api/"))
    return new Response(
      JSON.stringify({ error: "Sessão expirada. Entre novamente." }),
      { status: 401, headers },
    );
  return new Response(null, {
    status: 303,
    headers: {
      Location:
        "/login.html?next=" +
        encodeURIComponent(url.pathname + url.search + url.hash),
      "Cache-Control": "no-store",
    },
  });
}
export async function authResponse(
  request,
  env,
  now = Date.now(),
  options = {},
) {
  const json = (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, ...extra },
    });
  if (!configured(env))
    return json(
      {
        error: "Acesso indisponível. Configure AUTH_SESSION_SECRET na Vercel.",
      },
      503,
    );
  if (env.AUTH_MODE && !["shared", "n8n"].includes(env.AUTH_MODE))
    return json({ error: "Modo de autenticação inválido." }, 503);
  if (
    request.method === "GET" &&
    new URL(request.url).searchParams.get("config") === "1"
  )
    return json({ mode: env.AUTH_MODE === "n8n" ? "n8n" : "shared" });
  if (request.method === "GET") {
    const session = await readSession(request.headers.get("cookie"), env, now);
    if (!session)
      return json({ error: "Sessão expirada. Entre novamente." }, 401);
    if (env.AUTH_MODE === "n8n") {
      try {
        const user = await createIdentityService(env, {
          ...options,
          now: options.now ?? (() => now),
        }).getIdentity(session);
        return json({
          expiresAt: session.exp,
          serverNow: now,
          user,
          persistenceEnabled: env.PERSISTENCE_ENABLED === "true",
        });
      } catch (error) {
        return json(
          {
            error:
              error instanceof IdentityError
                ? error.message
                : "Serviço indisponível.",
          },
          error instanceof IdentityError ? error.status : 503,
        );
      }
    }
    return json({ expiresAt: session.exp, serverNow: now });
  }
  if (request.method !== "POST")
    return json({ error: "Método não permitido." }, 405, {
      Allow: "GET, POST",
    });
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin)
    return json({ error: "Origem inválida." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Formato inválido." }, 415);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1024)
      return json({ error: "Requisição muito grande." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (env.AUTH_MODE === "n8n") {
    const clear = {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    };
    try {
      const identityService = createIdentityService(env, {
        ...options,
        now: options.now ?? (() => now),
      });
      if (body?.action === "logout") {
        const session = await readSession(
          request.headers.get("cookie"),
          env,
          now,
        );
        if (session)
          try {
            await identityService.revoke(session);
          } catch (e) {
            if (e.status !== 401) throw e;
          }
        return json({ ok: true }, 200, clear);
      }
      const identity = await identityService.login(body?.email, body?.password);
      const token = await issueSession(env, now, identity),
        expiresAt = Math.min(identity.expiresAt, now + SESSION_MS);
      return json({ expiresAt, serverNow: now }, 200, {
        "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt - now) / 1000))}; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof IdentityError
              ? error.message
              : "Serviço de autenticação indisponível.",
        },
        error instanceof IdentityError ? error.status : 503,
        body?.action === "logout" ? clear : {},
      );
    }
  }
  if (body?.action === "logout")
    return json({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    });
  if (!(await passwordMatches(body?.password, env)))
    return json({ error: "Senha incorreta." }, 401);
  const token = await issueSession(env, now);
  return json({ expiresAt: now + SESSION_MS, serverNow: now }, 200, {
    "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}; Expires=${new Date(now + SESSION_MS).toUTCString()}${secure}`,
  });
}
