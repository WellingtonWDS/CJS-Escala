import {
  createPersistenceService,
  PersistenceError,
} from "./services/persistence.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1100000) {
        await reader.cancel();
        throw new PersistenceError("Requisição muito grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
// authenticate é injetado pelo servidor. Nunca obter identidade do corpo ou de cabeçalhos do cliente.
// Até existir o adaptador de login individual, o padrão é negar acesso.
export function createPersistenceHandler({
  env,
  authenticate = async () => null,
  fetchImpl,
  now,
} = {}) {
  return async (request) => {
    try {
      const identity = await authenticate(request);
      if (!identity)
        return json({ error: "Login individual necessário." }, 401);
      if (env?.PERSISTENCE_ENABLED !== "true")
        return json({ error: "Persistência ainda não habilitada." }, 503);
      if (request.method !== "POST")
        return json({ error: "Método não permitido." }, 405);
      const url = new URL(request.url);
      if (request.headers.get("origin") !== url.origin)
        return json({ error: "Origem inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return json({ error: "Formato inválido." }, 415);
      const raw = await readBody(request);
      let b;
      try {
        b = JSON.parse(raw);
      } catch {
        return json({ error: "JSON inválido." }, 400);
      }
      if (!b || typeof b !== "object" || Array.isArray(b))
        return json({ error: "Requisição inválida." }, 400);
      const actions = {
        listOffices: [],
        listCompanies: ["officeId"],
        listDrafts: ["officeId", "companyId"],
        getDraft: ["officeId", "companyId", "draftId"],
        saveDraft: ["officeId", "companyId", "key"],
        deleteDraft: ["officeId", "companyId", "draftId"],
      };
      if (!Object.hasOwn(actions, b.action))
        return json({ error: "Operação inválida." }, 400);
      if (actions[b.action].some((k) => !UUID.test(b[k])))
        return json({ error: "Identificador inválido." }, 400);
      if (
        b.action === "saveDraft" &&
        ((b.draftId != null && !UUID.test(b.draftId)) ||
          (b.revision != null &&
            (!Number.isInteger(b.revision) || b.revision < 1)) ||
          typeof b.title !== "string" ||
          !b.title.trim() ||
          b.title.length > 160 ||
          !b.state ||
          typeof b.state !== "object" ||
          Array.isArray(b.state))
      )
        return json({ error: "Rascunho inválido." }, 400);
      const service = createPersistenceService({ env, fetchImpl, now });
      if (b.action === "deleteDraft") {
        if (!Number.isSafeInteger(b.revision) || b.revision < 1)
          return json({ error: "Revisão inválida." }, 400);
        return json(await service.deleteDraft(identity, b));
      }
      if (b.action === "saveDraft")
        return json(await service.saveDraft(identity, b));
      return json(
        await service[b.action](
          identity,
          ...actions[b.action].map((k) => b[k]),
        ),
      );
    } catch (error) {
      return json(
        {
          error:
            error instanceof PersistenceError
              ? error.message
              : "Não foi possível concluir a operação.",
        },
        error instanceof PersistenceError ? error.status : 503,
      );
    }
  };
}
