import { compactarSnapshot, expandirSnapshot } from "./snapshot.js";
import { STORAGE_KEY } from "../config/regras-jornada.js";
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function validateSnapshot(state) {
  const copy = JSON.parse(
    JSON.stringify(expandirSnapshot(state)),
    (key, value) => {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error("Rascunho contém uma estrutura não permitida.");
      return value;
    },
  );
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
  const volatilePending = new Map();
  const volatileSnapshots = new Map();
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
    cacheVolatile: () => volatileSnapshots.has(cacheKey(context)),
    storage: {
      getItem: (k) => {
        const target = k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`;
        const value = volatileSnapshots.get(target) ?? raw.getItem(target);
        return k === STORAGE_KEY && value
          ? JSON.stringify(expandirSnapshot(JSON.parse(value)))
          : value;
      },
      setItem: (k, v) => {
        const target = k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`;
        const serialized =
          k === STORAGE_KEY
            ? JSON.stringify(compactarSnapshot(JSON.parse(v)))
            : v;
        try {
          raw.setItem(target, serialized);
          volatileSnapshots.delete(target);
        } catch (error) {
          if (k === STORAGE_KEY) volatileSnapshots.set(target, serialized);
          throw error;
        }
      },
      removeItem: (k) => {
        const target = k === STORAGE_KEY ? cacheKey(context) : `${prefix}:${k}`;
        volatileSnapshots.delete(target);
        raw.removeItem(target);
      },
    },
    activate(
      c,
      state,
      { allowVolatile = false, persistContextOnFailure = true } = {},
    ) {
      if (
        !uuid(c.officeId) ||
        !uuid(c.companyId) ||
        (c.draftId !== null && !uuid(c.draftId)) ||
        (c.revision !== null &&
          (!Number.isInteger(c.revision) || c.revision < 1))
      )
        throw Error("Contexto inválido.");
      const copy = validateSnapshot(state);
      const previous =
          volatileSnapshots.get(cacheKey(c)) ?? raw.getItem(cacheKey(c)),
        serialized = JSON.stringify(compactarSnapshot(copy));
      let cached = true;
      try {
        if (previous && previous !== serialized) {
          let recovery = previous;
          try {
            recovery = JSON.stringify(compactarSnapshot(JSON.parse(previous)));
          } catch {}
          raw.setItem(`${cacheKey(c)}:previous`, recovery);
          volatileSnapshots.delete(`${cacheKey(c)}:previous`);
        }
        raw.setItem(cacheKey(c), serialized);
        raw.setItem(contextKey, JSON.stringify(c));
        volatileSnapshots.delete(cacheKey(c));
      } catch (error) {
        if (!allowVolatile) throw error;
        cached = false;
        if (previous && previous !== serialized)
          volatileSnapshots.set(`${cacheKey(c)}:previous`, previous);
        volatileSnapshots.set(cacheKey(c), serialized);
        if (persistContextOnFailure)
          try {
            raw.setItem(contextKey, JSON.stringify(c));
          } catch {}
      }
      context = { ...c };
      return { cached };
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
      volatilePending.delete(key);
      for (const suffix of ["", ":previous", ":pending"]) {
        volatileSnapshots.delete(`${key}${suffix}`);
        raw.removeItem(`${key}${suffix}`);
      }
      return active;
    },
    legacy: () => raw.getItem(STORAGE_KEY),
    cached: (c) => {
      const value =
        volatileSnapshots.get(cacheKey(c)) ?? raw.getItem(cacheKey(c));
      return value ? validateSnapshot(JSON.parse(value)) : null;
    },
    previous: () => {
      const value =
        volatileSnapshots.get(`${cacheKey(context)}:previous`) ??
        raw.getItem(`${cacheKey(context)}:previous`);
      return value ? validateSnapshot(JSON.parse(value)) : null;
    },
    pending: () => {
      if (volatilePending.has(cacheKey(context)))
        return volatilePending.get(cacheKey(context));
      try {
        const body = JSON.parse(raw.getItem(`${cacheKey(context)}:pending`));
        if (body?.state) body.state = expandirSnapshot(body.state);
        return body;
      } catch {
        return null;
      }
    },
    pendingVolatile: () => volatilePending.has(cacheKey(context)),
    setPending: (body, { allowVolatile = false } = {}) => {
      try {
        raw.setItem(
          `${cacheKey(context)}:pending`,
          JSON.stringify({
            ...body,
            ...(body.state ? { state: compactarSnapshot(body.state) } : {}),
          }),
        );
        volatilePending.delete(cacheKey(context));
      } catch (error) {
        if (!allowVolatile) throw error;
        volatilePending.set(cacheKey(context), body);
      }
    },
    clearPending: (c = context) => {
      volatilePending.delete(cacheKey(c));
      raw.removeItem(`${cacheKey(c)}:pending`);
    },
  };
}
