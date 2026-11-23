import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
import { tentarAvisos } from "./notices.js";
import { validCnpj, normalizeCnpj } from "../assets/js/shared/empresas.js";
export function createCompaniesHandler({
  env,
  fetchImpl = fetch,
  now = Date.now,
}) {
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
        return json({ error: "Entre com sua conta." }, 401);
      const identity = {
          userId: session.userId,
          sessionId: session.sessionId,
          expiresAt: session.exp,
        },
        service = createPersistenceService({ env, fetchImpl, now });
      if (request.method === "GET") {
        // Tela inicial: cartões com resumo; sem a migração 011, volta à lista simples.
        if (new URL(request.url).searchParams.get("view") === "cards") {
          try {
            return json(await service.companyCards(identity));
          } catch (error) {
            if (error.status !== 501) throw error;
            return json({ ...(await service.companyOptions(identity)), summaryUnavailable: true });
          }
        }
        return json(await service.companyOptions(identity));
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
      if (body?.action === "createOffice") {
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 160
        )
          return json({ error: "Informe o nome do escritório." }, 400);
        return json(await service.createOffice(identity, body.name.trim()));
      }
      if (
        typeof body?.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 160 ||
        !validCnpj(body.cnpj) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.officeId || "",
        ) ||
        (body.apply !== undefined && typeof body.apply !== "boolean")
      )
        return json(
          { error: "Informe razão social, escritório e CNPJ válido." },
          400,
        );
      if (body.action === "updateCompany") {
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            body.companyId || "",
          ) ||
          typeof body.previousName !== "string" ||
          !(body.previousCnpj === null || typeof body.previousCnpj === "string")
        )
          return json({ error: "Reabra a empresa antes de editar." }, 400);
        return json(
          await service.updateCompany(identity, {
            ...body,
            name: body.name.trim(),
            cnpj: normalizeCnpj(body.cnpj),
          }),
        );
      }
      if (body.action !== undefined)
        return json({ error: "Operação inválida." }, 400);
      const resolvida = await service.resolveCompany(identity, {
        ...body,
        name: body.name.trim(),
        cnpj: normalizeCnpj(body.cnpj),
      });
      // Nova empresa pode levar o plano a 80%/100%: avisa o Gerente.
      if (resolvida?.status === "created")
        await tentarAvisos({ env, fetchImpl, now, origem: (env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "") });
      return json(resolvida);
    } catch (error) {
      const status = [400, 401, 402, 403, 409, 423].includes(error.status)
        ? error.status
        : 503;
      return json(
        {
          error:
            // Limite do plano, empresa arquivada e CNPJ travado: mensagens fixas do banco.
            [402, 423].includes(status)
              ? error.message
              : status === 409
              ? "Cadastro alterado por outro usuário ou documento/nome já utilizado. Reabra a lista e confira antes de salvar."
              : status === 403
                ? "Sem permissão para esta operação neste escritório ou empresa. Solicite acesso ao Admin ou gerente."
                : status === 400
                  ? "Razão social ou CNPJ inválido."
                  : status === 401
                    ? "Sessão expirada ou revogada."
                    : "Não foi possível consultar o cadastro. Confira a migração do banco e tente novamente.",
        },
        status,
      );
    }
  };
}
