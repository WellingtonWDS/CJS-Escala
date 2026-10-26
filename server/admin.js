import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
export function createAdminHandler({ env, fetchImpl = fetch, now = Date.now }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
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
        return json({ error: "Entre com sua conta para continuar." }, 401);
      const identity = {
        userId: session.userId,
        sessionId: session.sessionId,
        expiresAt: session.exp,
      };
      const service = createPersistenceService({ env, fetchImpl, now });
      if (request.method === "GET")
        return json(await service.managementOptions(identity));
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
      const uuid = (value) =>
        typeof value === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          value,
        );
      if (
        !uuid(body?.officeId) ||
        !Array.isArray(body.companyIds) ||
        !body.companyIds.every(uuid)
      )
        return json({ error: "Confira o escritório e as empresas." }, 400);
      if (body.action === "updateAccess") {
        if (!uuid(body.userId))
          return json({ error: "Selecione um operador." }, 400);
        return json(await service.updateUserAccess(identity, body));
      }
      if (body.action !== "createUser")
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
        !["admin", "manager", "operator"].includes(body.role)
      )
        return json(
          {
            error:
              "Confira os dados. A senha deve ter ao menos 6 caracteres e no máximo 72 bytes.",
          },
          400,
        );
      return json(
        { ok: true, user: await service.createUser(identity, body) },
        201,
      );
    } catch (error) {
      const status = [400, 401, 403, 409, 429].includes(error.status)
        ? error.status
        : 503;
      return json(
        {
          error:
            status === 409
              ? "Já existe uma conta com esse e-mail."
              : status === 400
                ? "Confira os dados, escritório e empresas selecionados."
                : status === 403
                  ? "Seu perfil não permite esta operação neste escritório."
                  : status === 401
                    ? "Sessão expirada ou revogada."
                    : "Gestão de usuários indisponível. Confira a migração do banco e tente novamente.",
        },
        status,
      );
    }
  };
}
