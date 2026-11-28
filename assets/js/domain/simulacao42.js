import {
  instrumentoValido,
  distribuicaoTransitoria42,
  dataValida,
  TRANSICAO_42_SEM_ACT,
} from "./ec141.js";
/* Regra anterior à liminar: somente ACT/CCT permitia selecionar 42h.
export function permiteSimular42(state, periodo) {
  const i = state.instrumentoColetivo || {};
  if (i.compativelEC141 !== true || !Number.isFinite(Number(i.limiteDiario)) || Number(i.limiteDiario) < 8.4) return false;
  if (state.modeloEscala === "fixa")
    return instrumentoValido(
      state,
      state.dataReferenciaFixa,
      "compensacaoDiaria",
    );
  if (!/^\d{4}-\d{2}$/.test(periodo || "")) return false;
  const [ano, mes] = periodo.split("-").map(Number);
  if (mes < 1 || mes > 12) return false;
  return [
    `${periodo}-01`,
    `${periodo}-${new Date(ano, mes, 0).getDate()}`,
  ].every((d) => instrumentoValido(state, d, "compensacaoDiaria"));
}
*/
export function permiteSimular42(state, periodo) {
  const alvo = {
    ...state,
    tipoEscala: "5x2",
    modoRegime: "simulacao",
    regimeJornada: "transicao42",
    // Meses antes de 16/12/2026 podem antecipar a fase de 42h (ver ec141.js).
    antecipacao42: true,
  };
  const i = state.instrumentoColetivo || {};
  const coletivo = (data) =>
    i.compativelEC141 === true &&
    Number.isFinite(Number(i.limiteDiario)) &&
    Number(i.limiteDiario) >= 8.4 &&
    instrumentoValido(state, data, "compensacaoDiaria");
  if (state.modeloEscala === "fixa")
    return (
      distribuicaoTransitoria42(alvo, state.dataReferenciaFixa) ||
      coletivo(state.dataReferenciaFixa)
    );
  if (!/^\d{4}-\d{2}$/.test(periodo || "")) return false;
  const [ano, mes] = periodo.split("-").map(Number);
  if (mes < 1 || mes > 12) return false;
  const inicio = `${periodo}-01`;
  const fim = `${periodo}-${new Date(ano, mes, 0).getDate()}`;
  // Nos meses de fronteira, a opção é liberada; o limite diário continua
  // sendo apurado para cada data, sem estender a exceção ao mês inteiro.
  return (
    distribuicaoTransitoria42(alvo, inicio) ||
    distribuicaoTransitoria42(alvo, fim) ||
    (coletivo(inicio) && coletivo(fim))
  );
}

/** Explica o bloqueio sem confundir uma data fora da transição com ACT obrigatório. */
export function diagnosticoSimulacao42(state, periodo) {
  const permitida = permiteSimular42(state, periodo);
  const fixa = state.modeloEscala === "fixa";
  const semInstrumento = state.instrumentoCompensacao === "nenhuma";
  const inicio = TRANSICAO_42_SEM_ACT.inicio;
  const fim = TRANSICAO_42_SEM_ACT.fim;
  const br = (data) => data.split("-").reverse().join("/");
  const intervalo = `${br(inicio)} a ${br(fim)}`;
  const antecipa = fixa ? state.dataReferenciaFixa < inicio : /^\d{4}-\d{2}$/.test(periodo || "") && `${periodo}-01` < inicio;
  if (permitida && antecipa && semInstrumento)
    return {
      permitida,
      motivo: "antecipacao",
      rotulo: "Simular fase de 42h (antecipada)",
      mensagem: `Antecipação da fase de 42h: a proposta usa 42h e dois repousos já ${fixa ? "na referência deste padrão" : "desde o início do mês"}. Antes de ${br(inicio)}, a distribuição de até 8h24 por dia depende de acordo de compensação no mês (art. 59, § 6º, da CLT) ou de ACT/CCT; esses dias ficam como pendência para formalizar. A partir de ${br(inicio)}, vale a regra transitória sem ACT/CCT.`,
    };
  if (permitida)
    return {
      permitida,
      motivo: "disponivel",
      rotulo: "Simular fase de 42h",
      mensagem: semInstrumento
        ? `42h disponíveis sem ACT/CCT: até 8h24 por dia em cinco dias, de ${intervalo}. ${fixa ? `Referência deste padrão: ${br(state.dataReferenciaFixa)}.` : "O limite é conferido em cada data, inclusive nos meses de início/fim da transição."}`
        : "42h disponíveis conforme as condições do ACT/CCT selecionado. A vigência e o limite diário declarado continuam sendo conferidos.",
    };
  if (fixa && !dataValida(state.dataReferenciaFixa))
    return {
      permitida,
      motivo: "referencia_invalida",
      rotulo: "42h — informe a referência jurídica",
      mensagem:
        "Informe uma Data de referência válida na Configuração. O padrão fixo usa essa data para conferir a regra de 42h, mesmo sem mês ou feriados.",
    };
  if (
    !fixa &&
    (!/^\d{4}-\d{2}$/.test(periodo || "") ||
      Number(periodo.slice(5)) < 1 ||
      Number(periodo.slice(5)) > 12)
  )
    return {
      permitida,
      motivo: "periodo_invalido",
      rotulo: "42h — informe o mês da proposta",
      mensagem:
        "Informe o Mês da proposta 5×2. A distribuição de 42h sem ACT/CCT vale de " +
        intervalo +
        ".",
    };
  const fora = fixa
    ? state.dataReferenciaFixa < inicio || state.dataReferenciaFixa > fim
    : periodo < inicio.slice(0, 7) || periodo > fim.slice(0, 7);
  if (fora)
    return {
      permitida,
      motivo: fixa ? "referencia_fora_transicao" : "periodo_fora_transicao",
      rotulo: fixa
        ? "42h — referência fora da transição"
        : "42h — mês fora da transição",
      mensagem: fixa
        ? `A referência deste padrão (${br(state.dataReferenciaFixa)}) está fora da transição de ${intervalo}. Para testar 42h sem ACT/CCT, altere a Data de referência na Configuração para uma data desse intervalo, por exemplo ${br(inicio)}. Não é necessário cadastrar ACT/CCT para essa hipótese.`
        : `O mês da proposta (${periodo.slice(5)}/${periodo.slice(0, 4)}) está fora da transição de ${intervalo}. Escolha um mês desse período para testar 42h sem ACT/CCT. Nos meses de fronteira, o limite é validado por dia.`,
    };
  if (!semInstrumento)
    return {
      permitida,
      motivo: "instrumento_selecionado",
      rotulo: "42h — confira a base selecionada",
      mensagem:
        "Há ACT/CCT ou banco de horas selecionado em Tipo de escala, mas as condições declaradas não autorizam esta distribuição. A dispensa de ACT/CCT não apaga um instrumento informado. Se a empresa não possui acordo/convenção, selecione Nenhuma compensação informada; não é necessário preencher um ACT/CCT fictício para liberar 42h.",
    };
  return {
    permitida,
    motivo: "regra_indisponivel",
    rotulo: "42h — condição transitória indisponível",
    mensagem:
      "A distribuição transitória sem ACT/CCT não está ativa para esta configuração. Confira a referência jurídica e a regra de transição antes de gerar a proposta.",
  };
}
