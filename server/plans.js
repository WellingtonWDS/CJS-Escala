import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const PLAN_ACTIONS = ["gerar", "proposta", "ajustes", "salvar", "importar", "exportar"];
/** Nomes dos colaboradores enviados para conferência do quadro (só o hash é guardado). */
export function rosterNames(list) {
  if (!Array.isArray(list) || list.length > 1000) return null;
  return list.filter((n) => typeof n === "string").map((n) => n.trim().slice(0, 200)).filter(Boolean);
}
const isoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
/** /api/plans: uso do plano (todos), arquivamento (gerente) e painel do Admin (somente Admin global, conferido no banco). */
export function createPlansHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (v, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  return async (request) => {
    try {
      const session = await readSession(request.headers.get("cookie"), env, now());
      if (env.AUTH_MODE !== "n8n" || session?.kind !== "individual")
        return json({ error: "Entre com sua conta individual." }, 401);
      const identity = { userId: session.userId, sessionId: session.sessionId, expiresAt: session.exp };
      const service = createPersistenceService({ env, fetchImpl, now });
      if (!["GET", "POST"].includes(request.method)) return json({ error: "Método não permitido." }, 405);
      let body;
      if (request.method === "POST") {
        if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Origem inválida." }, 403);
        if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Formato inválido." }, 415);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 120000) return json({ error: "Requisição muito grande." }, 413);
        try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido." }, 400); }
      } else body = Object.fromEntries(new URL(request.url).searchParams);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Requisição inválida." }, 400);
      const get = request.method === "GET", action = body.action;
      if (get && action === "overview") return json(await service.adminPlansOverview(identity));
      if (!uuid(body.officeId)) return json({ error: "Selecione o escritório." }, 400);
      if (get && action === "status") return json(await service.planStatus(identity, body.officeId));
      if (get && action === "detail") return json(await service.adminPlanDetail(identity, body.officeId));
      if (get) return json({ error: "Operação inválida." }, 400);
      if (action === "use") {
        const names = rosterNames(body.names);
        if (!uuid(body.companyId) || !PLAN_ACTIONS.includes(body.use) || !names || (body.confirmSwap !== undefined && typeof body.confirmSwap !== "boolean"))
          return json({ error: "Uso inválido." }, 400);
        try {
          return json(await service.planRegisterUse(identity, { officeId: body.officeId, companyId: body.companyId, action: body.use, names, confirmSwap: body.confirmSwap === true }));
        } catch (error) {
          if (error.status === 501) return json({ status: "liberado", plan: { limited: false }, pending: true });
          throw error;
        }
      }
      if (action === "archive") {
        if (!uuid(body.companyId) || typeof body.archived !== "boolean") return json({ error: "Informe a empresa." }, 400);
        return json(await service.companySetArchived(identity, body));
      }
      if (action === "savePlan") {
        const p = body;
        if ((p.revision !== null && !Number.isSafeInteger(p.revision)) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 60
          || !Number.isSafeInteger(p.companyLimit) || p.companyLimit < 1 || p.companyLimit > 10000
          || !Number.isSafeInteger(p.employeeLimit) || p.employeeLimit < 1 || p.employeeLimit > 500
          || !isoDate(p.cycleAnchor) || !["ativo", "suspenso"].includes(p.status) || typeof (p.notes ?? "") !== "string" || (p.notes ?? "").length > 500)
          return json({ error: "Confira os dados do plano." }, 400);
        return json(await service.adminPlanSave(identity, { ...p, name: p.name.trim(), notes: (p.notes ?? "").trim() }));
      }
      if (action === "removePlan") {
        if (!Number.isSafeInteger(body.revision)) return json({ error: "Revisão inválida." }, 400);
        return json(await service.adminPlanRemove(identity, body));
      }
      if (action === "courtesy") {
        if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 100 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 300)
          return json({ error: "Informe quantidade (1 a 100) e motivo." }, 400);
        return json(await service.adminPlanCourtesy(identity, { ...body, reason: body.reason.trim() }));
      }
      if (action === "demo") {
        if (typeof body.demo !== "boolean") return json({ error: "Informe a situação." }, 400);
        return json(await service.adminOfficeDemo(identity, body));
      }
      return json({ error: "Operação inválida." }, 400);
    } catch (error) {
      const status = [400, 401, 402, 403, 404, 409, 423, 501].includes(error.status) ? error.status : 503;
      const own = [402, 423, 501].includes(status) && error.message;
      return json({
        error: own || {
          400: "Confira os dados informados.",
          401: "Sessão expirada ou revogada.",
          403: "Acesso não permitido para o seu perfil.",
          404: "Registro não encontrado.",
          409: "O registro foi alterado por outra pessoa. Recarregue e confira antes de salvar.",
        }[status] || "Não foi possível consultar o plano. Confira a migração 010 no banco e tente novamente.",
      }, status);
    }
  };
}
