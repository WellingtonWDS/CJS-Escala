/** A referência 6×1 criada pela conversão mantém o contexto em que foi calculada. */
export function configDaEscala(state, escala = state.escalaGerada) {
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
