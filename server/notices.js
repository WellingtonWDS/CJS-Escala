/* Avisos automáticos ao Gerente (fila plan_notices, migração 018).
 * dispatchNotices: lê os pendentes, envia um e-mail por Gerente via n8n e marca os enviados.
 * Disparado na hora (uso do plano, troca de quadro, nova empresa) e diariamente pelo n8n (/api/notices). */
import { timingSafeEqual } from "node:crypto";
import { signJwt } from "./jwt.js";
import { createMailer } from "./mail.js";

async function gatewayRpc(env, fetchImpl, now, name, args) {
  const iat = Math.floor(now() / 1000);
  const token = await signJwt({ role: "cjs_identity_gateway", purpose: "identity", sub: "notices", iss: "cjs-escala-api", aud: "cjs-postgrest", iat, exp: iat + 60 }, env.PERSISTENCE_JWT_SECRET);
  const res = await fetchImpl(`${String(env.PERSISTENCE_RPC_URL).replace(/\/$/, "")}/rpc/${name}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Content-Profile": "cjs_api" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw Object.assign(Error("rpc"), { status: res.status });
  if (res.status === 204) return null;
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

/** Mensagem do n8n para um aviso e um destinatário. */
export function mensagemDeAviso(n, destinatario, origem) {
  const p = n.plan || {}, d = n.details || {};
  return {
    type: "plan_notice", kind: n.kind, to: destinatario.email, name: destinatario.name,
    officeName: n.officeName || "", companyName: n.companyName || "",
    planName: p.name || "", used: p.used ?? d.used ?? null, capacity: p.capacity ?? d.capacity ?? null, free: p.free ?? null,
    cycleStart: p.cycleStart || "", renewsAt: p.renewsAt || "", freed: d.freed ?? 0,
    novos: d.novos ?? null, total: d.total ?? null, actor: d.actor || "",
    appUrl: `${origem}/#empresas`, loginUrl: `${origem}/login.html`,
  };
}

export async function dispatchNotices({ env, fetchImpl = fetch, now = Date.now, origem }) {
  const mailer = createMailer({ env, fetchImpl });
  if (!mailer.configured() || !env.PERSISTENCE_RPC_URL || !env.PERSISTENCE_JWT_SECRET) return { skipped: true, sent: 0, failed: 0 };
  let pendentes;
  try {
    pendentes = await gatewayRpc(env, fetchImpl, now, "plan_notices_pending", { p_limit: 50 });
  } catch (error) {
    // Antes da migração 018 não há fila: nada a enviar.
    if (error.status === 404) return { skipped: true, sent: 0, failed: 0 };
    throw error;
  }
  const enviados = [];
  let falhas = 0;
  for (const n of Array.isArray(pendentes) ? pendentes : []) {
    let ok = true;
    for (const destinatario of n.recipients || []) ok = (await mailer.send(mensagemDeAviso(n, destinatario, origem))) && ok;
    if (ok) enviados.push(n.id);
    else falhas++;
  }
  if (enviados.length) await gatewayRpc(env, fetchImpl, now, "plan_notices_done", { p_ids: enviados });
  return { sent: enviados.length, failed: falhas };
}
/** Disparo sem interromper a operação principal. */
export async function tentarAvisos(opcoes) {
  try {
    return await dispatchNotices(opcoes);
  } catch {
    console.error("CJS_NOTICES_FAILURE");
    return null;
  }
}

const chaveConfere = (recebida, esperada) => {
  if (typeof recebida !== "string" || typeof esperada !== "string" || esperada.length < 32) return false;
  const a = Buffer.from(recebida), b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
};
/** /api/notices: chamado pelo n8n (agendamento diário) com X-CJS-Service-Key. */
export function createNoticesHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  return async (request) => {
    if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
    if (!chaveConfere(request.headers.get("x-cjs-service-key"), env.N8N_SERVICE_SECRET)) return json({ error: "Não autorizado." }, 401);
    try {
      const origem = (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
      return json({ ok: true, ...(await dispatchNotices({ env, fetchImpl, now, origem })) });
    } catch {
      return json({ error: "Não foi possível enviar os avisos agora." }, 503);
    }
  };
}
