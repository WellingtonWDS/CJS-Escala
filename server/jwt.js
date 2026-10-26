const encoder = new TextEncoder();
const encode = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decode = (text) => {
  if (typeof text !== "string" || !/^[\w-]+$/.test(text))
    throw Error("JWT inválido");
  return Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
};
async function key(secret, uses) {
  if (typeof secret !== "string" || secret.length < 32)
    throw Error("Chave não configurada");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    uses,
  );
}
export async function signJwt(payload, secret) {
  const value = `${encode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))}.${encode(encoder.encode(JSON.stringify(payload)))}`;
  return `${value}.${encode(await crypto.subtle.sign("HMAC", await key(secret, ["sign"]), encoder.encode(value)))}`;
}
export async function verifyIdentityJwt(token, env, now = Date.now()) {
  if (
    typeof env.N8N_JWT_ISSUER !== "string" ||
    !env.N8N_JWT_ISSUER ||
    typeof env.N8N_JWT_AUDIENCE !== "string" ||
    !env.N8N_JWT_AUDIENCE
  )
    throw Error("Verificador não configurado");
  if (typeof token !== "string" || token.length > 8192)
    throw Error("Identidade inválida");
  const parts = token.split(".");
  if (parts.length !== 3) throw Error("Identidade inválida");
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if (header.alg !== "HS256" || header.crit) throw Error("Algoritmo inválido");
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await key(env.N8N_JWT_SECRET, ["verify"]),
      decode(parts[2]),
      encoder.encode(parts.slice(0, 2).join(".")),
    ))
  )
    throw Error("Assinatura inválida");
  const p = JSON.parse(new TextDecoder().decode(decode(parts[1]))),
    seconds = Math.floor(now / 1000);
  if (
    typeof p.sub !== "string" ||
    !p.sub ||
    p.sub.length > 255 ||
    !Number.isSafeInteger(p.iat) ||
    !Number.isSafeInteger(p.exp) ||
    p.exp <= seconds ||
    p.iat > seconds ||
    p.exp <= p.iat ||
    p.exp - p.iat > 43200 ||
    (p.nbf !== undefined &&
      (!Number.isSafeInteger(p.nbf) || p.nbf > seconds)) ||
    p.iss !== env.N8N_JWT_ISSUER ||
    !(
      p.aud === env.N8N_JWT_AUDIENCE ||
      (Array.isArray(p.aud) && p.aud.includes(env.N8N_JWT_AUDIENCE))
    )
  )
    throw Error("Claims inválidos");
  return { subject: p.sub, expiresAt: p.exp * 1000 };
}
