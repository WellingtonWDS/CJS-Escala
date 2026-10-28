/** A referência 6×1 criada pela conversão mantém o contexto em que foi calculada. */
import { contextoModelo } from "./modelo-escala.js";
export function configDaEscala(state, escala = state.escalaGerada) {
  state = contextoModelo(state);
  if (!escala?.referenciaAtual44) return state;
  const base = escala.instrumentoReferencia?.base || "nenhuma";
  const condicoes =
    escala.instrumentoReferencia?.condicoes || state.instrumentoColetivo;
  if (
    state.modoRegime === "simulacao" &&
    state.regimeJornada === "atual44" &&
    state.instrumentoCompensacao === base &&
    state.instrumentoColetivo === condicoes
  )
    return state;
  return {
    ...state,
    modoRegime: "simulacao",
    regimeJornada: "atual44",
    instrumentoCompensacao: base,
    instrumentoColetivo: condicoes,
  };
}
