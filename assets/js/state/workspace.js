import { STORAGE_KEY } from "../config/regras-jornada.js";
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function validateSnapshot(state) {
  const copy = JSON.parse(JSON.stringify(state), (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw Error("Rascunho contém uma estrutura não permitida.");
    return value;
  });
  if (
    !copy ||
    typeof copy !== "object" ||
    !Array.isArray(copy.colaboradores) ||
    copy.colaboradores.some(
      (c) => !c || typeof c.nome !== "string" || typeof c.id !== "number",
    ) ||
    !Number.isInteger(copy.mes) ||
    copy.mes < 0 ||
    copy.mes > 11 ||
    !Number.isInteger(copy.ano) ||
    !copy.jornada ||
    typeof copy.jornada !== "object" ||
    !Array.isArray(copy.diasTrabalho)
  )
    throw Error("O rascunho não tem um formato compatível com este sistema.");
  return copy;
}
export function createWorkspace(raw, userId) {
  if (!uuid(userId)) throw Error("Identidade inválida.");
  const prefix = `${STORAGE_KEY}:user:${userId}`,
    contextKey = `${prefix}:context`;
  let context = null;
  try {
    const c = JSON.parse(raw.getItem(contextKey));
    if (
      c &&
      uuid(c.officeId) &&
      uuid(c.companyId) &&
      (c.draftId === null || uuid(c.draftId)) &&
      (c.revision === null || (Number.isInteger(c.revision) && c.revision > 0))
    )
      context = c;
  } catch {}
  const cacheKey = (c) =>
    `${prefix}:${c?.officeId || "pending"}:${c?.companyId || "pending"}:${c?.draftId || "new"}`;
  return {
    context: () => (context ? { ...context } : null),
    storage: {
      getItem: (k) =>
        raw.getItem(k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`),
      setItem: (k, v) =>
        raw.setItem(
          k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`,
          v,
        ),
      removeItem: (k) =>
        raw.removeItem(
          k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`,
        ),
    },
    activate(c, state) {
      if (
        !uuid(c.officeId) ||
        !uuid(c.companyId) ||
        (c.draftId !== null && !uuid(c.draftId)) ||
        (c.revision !== null &&
          (!Number.isInteger(c.revision) || c.revision < 1))
      )
        throw Error("Contexto inválido.");
      const copy = validateSnapshot(state);
      const previous = raw.getItem(cacheKey(c)),
        serialized = JSON.stringify(copy);
      if (previous && previous !== serialized)
        raw.setItem(`${cacheKey(c)}:previous`, previous);
      raw.setItem(cacheKey(c), serialized);
      raw.setItem(contextKey, JSON.stringify(c));
      context = { ...c };
    },
    reset() {
      raw.removeItem(contextKey);
      context = null;
    },
    forgetDraft(c) {
      if (!uuid(c.officeId) || !uuid(c.companyId) || !uuid(c.draftId))
        throw Error("Preenchimento inválido.");
      const active =
        context?.officeId === c.officeId &&
        context?.companyId === c.companyId &&
        context?.draftId === c.draftId;
      if (active) {
        raw.removeItem(contextKey);
        context = null;
      }
      const key = cacheKey(c);
      for (const suffix of ["", ":previous", ":pending"])
        raw.removeItem(`${key}${suffix}`);
      return active;
    },
    legacy: () => raw.getItem(STORAGE_KEY),
    cached: (c) => {
      const value = raw.getItem(cacheKey(c));
      return value ? validateSnapshot(JSON.parse(value)) : null;
    },
    previous: () => {
      const value = raw.getItem(`${cacheKey(context)}:previous`);
      return value ? validateSnapshot(JSON.parse(value)) : null;
    },
    pending: () => {
      try {
        return JSON.parse(raw.getItem(`${cacheKey(context)}:pending`));
      } catch {
        return null;
      }
    },
    setPending: (body) =>
      raw.setItem(`${cacheKey(context)}:pending`, JSON.stringify(body)),
    clearPending: (c = context) => raw.removeItem(`${cacheKey(c)}:pending`),
  };
}
