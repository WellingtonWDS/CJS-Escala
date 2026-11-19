import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
const uuid = (v) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const cor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/.test(v);
export const MAX_LOGO_CHARS = 700000;
/** Valida a marca enviada pelo navegador (logomarca já convertida em PNG). */
export function marcaValida(b) {
  if (!b || typeof b !== "object" || !uuid(b.officeId) || !Number.isSafeInteger(b.revision) || b.revision < 0) return false;
  if (b.displayName !== null && (typeof b.displayName !== "string" || b.displayName.length > 160)) return false;
  if (!cor(b.primaryColor) || !cor(b.secondaryColor)) return false;
  if (b.logo === null) return b.logoWidth === null && b.logoHeight === null;
  return typeof b.logo === "string" && b.logo.length <= MAX_LOGO_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(b.logo)
    && [b.logoWidth, b.logoHeight].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= 2000);
}
/** /api/branding: marca do escritório usada nos relatórios. Permissões conferidas no banco. */
export function createBrandingHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (v, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
  return async (request) => {
    try {
      const session = await readSession(request.headers.get("cookie"), env, now());
      if (env.AUTH_MODE !== "n8n" || session?.kind !== "individual") return json({ error: "Entre com sua conta individual." }, 401);
      const identity = { userId: session.userId, sessionId: session.sessionId, expiresAt: session.exp };
      const service = createPersistenceService({ env, fetchImpl, now });
      if (request.method === "GET") {
        const officeId = new URL(request.url).searchParams.get("officeId");
        if (!uuid(officeId)) return json({ error: "Selecione o escritório." }, 400);
        try {
          return json(await service.officeBrandingGet(identity, officeId));
        } catch (error) {
          // Antes da migração 012: relatório com a marca padrão.
          if (error.status === 501) return json({ officeId, revision: 0, logo: null, primaryColor: "#0f2844", secondaryColor: "#1f7a54", canEdit: false, pending: true });
          throw error;
        }
      }
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Formato inválido." }, 415);
      const raw = await request.text();
      if (Buffer.byteLength(raw) > MAX_LOGO_CHARS + 4000) return json({ error: "Logomarca muito grande. Use uma imagem menor." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido." }, 400); }
      const b = { ...body, displayName: typeof body?.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : null };
      if (!marcaValida(b)) return json({ error: "Confira a logomarca e as cores." }, 400);
      return json(await service.officeBrandingSave(identity, b));
    } catch (error) {
      const status = [400, 401, 403, 409, 501].includes(error.status) ? error.status : 503;
      return json({ error: {
        400: "Confira a logomarca e as cores.",
        401: "Sessão expirada ou revogada.",
        403: "Somente o gerente do escritório pode alterar a marca.",
        409: "A marca foi alterada por outra pessoa. Reabra antes de salvar.",
        501: "Marca do escritório ainda não configurada no banco (migração 012).",
      }[status] || "Não foi possível consultar ou salvar a marca. Tente novamente." }, status);
    }
  };
}
