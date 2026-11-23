import { readSession } from "./auth.js";
import { createPersistenceService } from "./services/persistence.js";
import { createMailer, origemPublica, mensagemDeAcesso } from "./mail.js";
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
      if (request.method === "GET") {
        const options = await service.managementOptions(identity);
        // Convites ainda não aceitos (antes da migração 014: nenhum).
        let pendingInvites = [];
        try {
          pendingInvites = await service.pendingInvites(identity);
        } catch (error) {
          if (error.status !== 501) throw error;
        }
        return json({ ...options, pendingInvites, invitesEnabled: createMailer({ env, fetchImpl }).configured() });
      }
      if (request.method !== "POST")
        return json({ error: "Método não permitido." }, 405);
      if (request.headers.get("origin") !== new URL(request.url).origin)
        return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return json({ error: "Formato inválido." }, 415);
      const raw = await request.text();
      if (raw.length > 65536)
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
      const mailer = createMailer({ env, fetchImpl });
      // Admin muda o escritório (ou promove/rebaixa de Admin global) de um usuário.
      if (body?.action === "moveUser") {
        if (!uuid(body.userId) || !Number.isSafeInteger(body.revision) || body.revision < 1 || !["admin", "manager", "operator"].includes(body.role)
          || !(body.role === "admin" || uuid(body.toOfficeId)) || !Array.isArray(body.companyIds) || !body.companyIds.every(uuid) || body.companyIds.length > 1000)
          return json({ error: "Escolha o escritório, o perfil e as empresas." }, 400);
        return json(await service.moveUser(identity, body));
      }
      // Link de acesso enviado pelo Gerente a quem já está cadastrado (convite ou redefinição).
      if (body?.action === "sendAccessLink") {
        // Admin global não tem escritório: officeId nulo (o banco confere que só Admin envia).
        if (!uuid(body.userId) || !(uuid(body.officeId) || body.officeId === null)) return json({ error: "Selecione o usuário." }, 400);
        if (!mailer.configured()) return json({ error: "Envio de e-mails não configurado. Configure N8N_MAIL_URL na hospedagem." }, 503);
        const r = await service.sendAccessLink(identity, body);
        const enviado = await mailer.send(mensagemDeAcesso(r, origemPublica(env, request)));
        if (!enviado) return json({ error: "O link foi gerado, mas o e-mail não pôde ser enviado agora. Tente novamente em instantes." }, 502);
        return json({ ok: true, kind: r.kind, emailSent: true });
      }
      if (
        !(
          uuid(body?.officeId) ||
          (body?.action === "updateUser" && body.officeId === null) ||
          (body?.action === "inviteUser" && body.role === "admin" && body.officeId === null)
        ) ||
        !Array.isArray(body.companyIds) ||
        !body.companyIds.every(uuid)
      )
        return json({ error: "Confira o escritório e as empresas." }, 400);
      if (body.action === "updateUser") {
        if (
          !uuid(body.userId) ||
          !Number.isSafeInteger(body.revision) ||
          body.revision < 1 ||
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 160 ||
          !(
            body.email === null ||
            (typeof body.email === "string" &&
              body.email.length <= 254 &&
              /^\S+@\S+\.\S+$/.test(body.email.trim()))
          ) ||
          !["admin", "manager", "operator", "viewer"].includes(body.role) ||
          typeof body.active !== "boolean" ||
          typeof body.accountActive !== "boolean" ||
          body.companyIds.length > 1000
        )
          return json({ error: "Confira os dados do usuário." }, 400);
        return json(await service.updateUser(identity, body));
      }
      if (body.action === "updateAccess") {
        if (!uuid(body.userId))
          return json({ error: "Selecione um operador." }, 400);
        return json(await service.updateUserAccess(identity, body));
      }
      if (body.action === "inviteUser") {
        if (
          typeof body.name !== "string" || !body.name.trim() || body.name.length > 160 ||
          typeof body.email !== "string" || body.email.length > 254 || !/^\S+@\S+\.\S+$/.test(body.email.trim()) ||
          !["admin", "manager", "operator"].includes(body.role)
        )
          return json({ error: "Confira nome, e-mail e perfil." }, 400);
        if (!mailer.configured()) return json({ error: "Envio de e-mails não configurado. Configure N8N_MAIL_URL na hospedagem." }, 503);
        const r = await service.inviteUser(identity, body);
        const emailSent = await mailer.send(mensagemDeAcesso(r.mail, origemPublica(env, request)));
        // O link nunca volta ao navegador do Gerente.
        return json({ ok: true, user: r.user, emailSent }, 201);
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
      const status = [400, 401, 403, 404, 409, 429, 501].includes(error.status)
        ? error.status
        : 503;
      return json(
        {
          error:
            status === 409
              ? "O cadastro mudou ou o e-mail já está em uso. Atualize a lista e confira os dados."
              : status === 404
                ? "Usuário não encontrado."
                : status === 400
                  ? "Confira os dados. Operador e Gerente precisam de um escritório; não é permitido alterar o próprio perfil; mantenha ao menos um Admin ativo."
                  : status === 403
                    ? "Seu perfil não permite esta operação neste escritório."
                    : status === 401
                      ? "Sessão expirada ou revogada."
                      : status === 429
                        ? "Muitos envios em pouco tempo. Aguarde e tente novamente."
                        : status === 501
                          ? "Convites ainda não configurados no banco (migração 014)."
                      : "Gestão de usuários indisponível. Confira a migração do banco e tente novamente.",
        },
        status,
      );
    }
  };
}
