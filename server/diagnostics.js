import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
import { validarDiagnostico } from "../assets/js/diagnostico/questionario.js";
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createDiagnosticsHandler({
  env,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const json = (v, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  return async (request) => {
    try {
      const session = await readSession(
        request.headers.get("cookie"),
        env,
        now(),
      );
      if (env.AUTH_MODE !== "n8n" || session?.kind !== "individual")
        return json({ error: "Entre com sua conta individual." }, 401);
      const identity = {
        userId: session.userId,
        sessionId: session.sessionId,
        expiresAt: session.exp,
      };
      const service = createPersistenceService({ env, fetchImpl, now });
      if (!["GET", "POST"].includes(request.method))
        return json({ error: "Método não permitido." }, 405);
      let body;
      if (request.method === "POST") {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return json({ error: "Origem inválida." }, 403);
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          return json({ error: "Formato inválido." }, 415);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 200000)
          return json({ error: "Diagnóstico muito grande." }, 413);
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "JSON inválido." }, 400);
        }
      } else body = Object.fromEntries(new URL(request.url).searchParams);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "Diagnóstico em formato inválido." }, 400);
      const action = body.action || "options";
      if (action === "options" && request.method === "GET")
        return json(await service.diagnosticOptions(identity));
      if (!uuid(body.officeId) || !uuid(body.companyId))
        return json({ error: "Selecione o escritório e a empresa." }, 400);
      if (action === "list" && request.method === "GET")
        return json(await service.diagnosticList(identity, body));
      if (!uuid(body.id)) return json({ error: "Diagnóstico inválido." }, 400);
      if (action === "get" && request.method === "GET") {
        const revision =
          body.revision === undefined ? null : Number(body.revision);
        if (
          revision !== null &&
          (!Number.isSafeInteger(revision) || revision < 1)
        )
          return json({ error: "Revisão inválida." }, 400);
        return json(
          await service.diagnosticGet(identity, { ...body, revision }),
        );
      }
      if (action !== "save" || request.method !== "POST")
        return json({ error: "Operação inválida." }, 400);
      if (
        !uuid(body.key) ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 0
      )
        return json({ error: "Revisão ou chave inválida." }, 400);
      if (!["rascunho", "concluido"].includes(body.status))
        return json({ error: "Informe a situação do diagnóstico." }, 400);
      try {
        validarDiagnostico(body.data, body.status);
      } catch (error) {
        return json({ error: error.message }, 400);
      }
      return json(await service.diagnosticSave(identity, body));
    } catch (error) {
      const status = [400, 401, 403, 404, 409].includes(error.status)
        ? error.status
        : 503;
      return json(
        {
          error:
            {
              400: "Confira os dados do diagnóstico.",
              401: "Sessão expirada ou revogada.",
              403: "Diagnóstico disponível apenas para Gerentes e Admins do escritório autorizado.",
              404: "Diagnóstico ou revisão não encontrado.",
              409: "Há outra revisão ou uma gravação pendente. Suas respostas foram mantidas nesta tela; consulte a versão atual antes de substituir.",
            }[status] ||
            "Não foi possível consultar ou salvar o diagnóstico. Confira a migração 009 no banco e tente novamente. Nenhum salvamento foi confirmado.",
        },
        status,
      );
    }
  };
}
