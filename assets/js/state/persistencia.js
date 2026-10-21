import { VERSAO_REGRAS } from "../domain/ec141.js";
import { STORAGE_KEY } from "../config/regras-jornada.js";
import { replaceState, atualizarNomesExemplo } from "./store.js";
export function createPersistence({ state, initialState, storage }) {
  function saveState() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("Não foi possível salvar:", e);
      return false;
    }
  }

  function loadState() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const regrasAntigas =
        parsed?.escalaGerada &&
        parsed.escalaGerada.versaoRegras !== VERSAO_REGRAS;
      if (regrasAntigas) parsed.escalaGerada = null;
      if (parsed?.conversao && parsed.conversao.versaoRegras !== VERSAO_REGRAS)
        parsed.conversao.desatualizada = true;
      const acordoRemovido = parsed?.instrumentoCompensacao === "individual";
      if (acordoRemovido) {
        parsed.instrumentoCompensacao = "nenhuma";
        parsed.escalaGerada = null;
      }
      // As demandas anteriores já eram utilizadas, portanto continuam ativas.
      if (
        parsed &&
        !Object.hasOwn(parsed, "coberturaAtiva") &&
        parsed.demandasCobertura?.length
      )
        parsed.coberturaAtiva = true;
      replaceState(
        state,
        deepMerge(JSON.parse(JSON.stringify(initialState)), parsed),
      );
      atualizarNomesExemplo(state);
      if (acordoRemovido || regrasAntigas) saveState();
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
        k === "jornadaPorDia" &&
        incoming[k] &&
        typeof incoming[k] === "object" &&
        !Array.isArray(incoming[k])
      ) {
        // Mapa dinâmico: os dias não existem no estado inicial vazio.
        base[k] = { ...base[k], ...incoming[k] };
      } else if (
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
