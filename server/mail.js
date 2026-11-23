/* Envio de e-mails transacionais pelo fluxo n8n "Reescala — E-mails".
 * O n8n só monta e envia a mensagem; links e decisões ficam no backend. */
export function createMailer({ env, fetchImpl = fetch }) {
  function url() {
    if (typeof env.N8N_MAIL_URL !== "string" || !env.N8N_MAIL_URL || typeof env.N8N_SERVICE_SECRET !== "string" || env.N8N_SERVICE_SECRET.length < 32) return null;
    try {
      const u = new URL(env.N8N_MAIL_URL);
      const local = env.PERSISTENCE_ALLOW_LOCAL_HTTP === "true" && u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
      if (u.username || u.password || u.search || u.hash || !(u.protocol === "https:" || local)) return null;
      return u.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  }
  return {
    configured: () => !!url(),
    /** true quando o n8n confirmou o recebimento; falhas não interrompem o fluxo. */
    async send(mensagem) {
      const destino = url();
      if (!destino) return false;
      try {
        const res = await fetchImpl(destino, {
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
    },
  };
}
/** Origem pública usada nos links dos e-mails. */
export const origemPublica = (env, request) => (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
/** Mensagem do n8n a partir do link gerado no banco (convite ou redefinição pelo gerente). */
export function mensagemDeAcesso(r, origem) {
  const base = { to: r.email, name: r.name, officeName: r.officeName || "", invitedBy: r.invitedBy || "", expiresMinutes: r.expiresMinutes, loginUrl: `${origem}/login.html` };
  return r.kind === "invite"
    ? { type: "invite", ...base, inviteUrl: `${origem}/redefinir-senha.html#token=${r.token}` }
    : { type: "password_reset", ...base, requestedBy: r.invitedBy || "", resetUrl: `${origem}/redefinir-senha.html#token=${r.token}` };
}
