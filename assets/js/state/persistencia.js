import { STORAGE_KEY } from "../config/regras-jornada.js";
import { replaceState } from "./store.js";
export function createPersistence({ state, initialState, storage }) {
  function saveState() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Não foi possível salvar:", e);
    }
  }

  function loadState() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      replaceState(
        state,
        deepMerge(JSON.parse(JSON.stringify(initialState)), parsed),
      );
      return true;
    } catch (e) {
      console.warn("Não foi possível ler o localStorage:", e);
      return false;
    }
  }

  function deepMerge(base, incoming) {
    if (!incoming || typeof incoming !== "object") return base;
    Object.keys(incoming).forEach((k) => {
      if (
        incoming[k] &&
        typeof incoming[k] === "object" &&
        !Array.isArray(incoming[k]) &&
        base[k] &&
        typeof base[k] === "object" &&
        !Array.isArray(base[k])
      ) {
        base[k] = deepMerge(base[k], incoming[k]);
      } else if (k in base) {
        base[k] = incoming[k];
      }
    });
    return base;
  }
  return {
    saveState,
    loadState,
    clearState: () => storage.removeItem(STORAGE_KEY),
  };
}
