import { validarRestricoes } from "./restricoes.js";
import { escalaFixa, conferirSuporteFixo, colaboradorRecorrente } from "./modelo-escala.js";
import {
  jornadaValidaEstrutural,
  timeToMin,
  diasNoMes,
} from "./datas-horas.js";
import { dataValida } from "./ec141.js";
import { perfilAtivo, verificarPerfil } from "./perfil-dominio.js";
import { validarDemanda } from "./cobertura.js";

// Somente dados necessários ao cálculo. Alertas legais são apurados na escala.
export function pendenciasPreenchimento(state, destino) {
  const pendencias = [];
  const add = (etapa, seletor, mensagem) =>
    pendencias.push({ etapa, seletor, mensagem });
  if (escalaFixa(state)) {
    try { conferirSuporteFixo(state); }
    catch (error) { add("sec-config", "#cfg-modelo", error.message); }
  }
  if (
    !escalaFixa(state) && (
    !Number.isInteger(state.mes) ||
    state.mes < 0 ||
    state.mes > 11 ||
    !Number.isInteger(state.ano) ||
    state.ano < 2026 ||
    state.ano > 2100)
  )
    add(
      "sec-config",
      "#cfg-mes",
      "Informe um mês e ano válidos para a escala atual.",
    );
  else if (
    !escalaFixa(state) && (
    !Number.isInteger(state.diaInicio) ||
    state.diaInicio < 1 ||
    state.diaInicio > diasNoMes(state.mes, state.ano))
  )
    add("sec-config", "#cfg-diaInicio", "Informe um dia de início válido.");
  const pessoas = state.colaboradores || [];
  if (!pessoas.length)
    add(
      "sec-config",
      "#config-colaboradores",
      "Cadastre ao menos um colaborador.",
    );
  for (const c of pessoas) {
    const campo = (f) => `#colab-list [data-id="${c.id}"][data-field="${f}"]`;
    const nome = String(c.nome || "").trim();
    for (const erro of validarRestricoes(escalaFixa(state) ? colaboradorRecorrente(c) : c))
      add(
        "sec-config",
        `[data-restricoes="${c.id}"]`,
        `${nome || "Colaborador"}: ${erro}`,
      );
    if (!nome)
      add("sec-config", campo("nome"), "Preencha o nome do colaborador.");
    if (!["feminino", "masculino"].includes(c.sexo))
      add(
        "sec-config",
        campo("sexo"),
        `${nome || "Colaborador"}: informe o sexo no cadastro.`,
      );
    if (!String(c.cargo || "").trim())
      add(
        "sec-config",
        campo("cargo"),
        `${nome || "Colaborador"}: preencha o cargo / função.`,
      );
    if (
      !Number.isFinite(c.horasSemana) ||
      c.horasSemana <= 0 ||
      c.horasSemana > 44
    )
      add(
        "sec-config",
        campo("horasSemana"),
        `${nome || "Colaborador"}: informe a carga contratual entre 1 e 44 horas.`,
      );
    if (perfilAtivo(c)) {
      try {
        verificarPerfil(c);
      } catch (error) {
        add("sec-config", `[data-perfil-dominio="${c.id}"]`, error.message);
      }
      const p = c.quadroDominio;
      if (
        Object.values((p.tipo === "ciclo" ? p.ciclo : p.semana) || {}).some(
          (h) => h.status === "trabalho" && !jornadaValidaEstrutural(h.jornada),
        )
      )
        add(
          "sec-config",
          `[data-perfil-dominio="${c.id}"]`,
          `${nome}: complete os horários individuais importados.`,
        );
      if (!escalaFixa(state) && p.admissaoIso && !dataValida(p.admissaoIso))
        add(
          "sec-config",
          `[data-perfil-dominio="${c.id}"]`,
          `${nome}: confira a data de admissão.`,
        );
    }
  }
  const compartilhado = !pessoas.length || pessoas.some((c) => !perfilAtivo(c));
  if (!Array.isArray(state.diasTrabalho) || !state.diasTrabalho.length)
    add(
      "sec-jornada",
      "#weekday-picker",
      "Selecione os dias de funcionamento da empresa.",
    );
  if (compartilhado) {
    const dias =
      state.horarioPorDia && state.tipoEscala !== "12x36"
        ? state.diasTrabalho || []
        : [null];
    for (const dia of dias) {
      const jornada =
        dia == null
          ? state.jornada
          : state.jornadaPorDia?.[dia] || state.jornada;
      if (!jornadaValidaEstrutural(jornada))
        add(
          "sec-jornada",
          dia == null
            ? "#jornada-padrao-grid"
            : `#jornada-por-dia-wrap [data-day="${dia}"]`,
          dia == null
            ? "Complete entrada, intervalo e saída da jornada."
            : `Complete os horários de ${["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][dia]}.`,
        );
    }
    if (state.tipoEscala === "12x36" && !dataValida(state.ancora12x36))
      add(
        "sec-jornada",
        "#ancora-12x36",
        "Informe a data de referência do ciclo 12×36.",
      );
    if (
      state.turnosRevezamento &&
      state.tipoEscala !== "12x36" &&
      !Number.isFinite(timeToMin(state.entradaTurnoB))
    )
      add("sec-jornada", "#entrada-turno-b", "Informe a entrada do Turno B.");
  }
  const clausula = state.instrumentoColetivo || {};
  if (clausula.intervaloComputado || clausula.creditoNoturnoUmaHora) {
    if (state.instrumentoCompensacao !== "act_cct")
      add(
        "sec-tipo",
        "#instrumento-compensacao",
        "Selecione ACT/CCT para utilizar as condições especiais de cômputo dos plantões.",
      );
    if (!clausula.regime12x36)
      add(
        "sec-tipo",
        "#act-12x36",
        "Informe o instrumento para o regime 12×36 ao utilizar as condições especiais de cômputo.",
      );
  }
  if (
    state.instrumentoCompensacao &&
    state.instrumentoCompensacao !== "nenhuma"
  ) {
    const i = state.instrumentoColetivo || {};
    if (!String(i.identificacao || "").trim())
      add(
        "sec-tipo",
        "#act-identificacao",
        "Informe a identificação do ACT/CCT selecionado.",
      );
    if (!dataValida(i.inicio))
      add(
        "sec-tipo",
        "#act-inicio",
        "Informe o início da vigência do ACT/CCT.",
      );
    if (!dataValida(i.fim) || (dataValida(i.inicio) && i.fim < i.inicio))
      add(
        "sec-tipo",
        "#act-fim",
        "Informe um fim de vigência válido para o ACT/CCT.",
      );
    if (
      i.compensacaoDiaria &&
      (!Number.isFinite(i.limiteDiario) ||
        i.limiteDiario < 8 ||
        i.limiteDiario > 24)
    )
      add("sec-tipo", "#act-limite", "Informe o limite diário autorizado.");
    if (i.compensacaoHoras) {
      if (!dataValida(i.apuracaoInicio))
        add(
          "sec-tipo",
          "#act-apuracao-inicio",
          "Informe o início da apuração de horas.",
        );
      if (
        !dataValida(i.apuracaoFim) ||
        (dataValida(i.apuracaoInicio) && i.apuracaoFim < i.apuracaoInicio)
      )
        add(
          "sec-tipo",
          "#act-apuracao-fim",
          "Informe um fim válido para a apuração de horas.",
        );
      if (
        !Number.isFinite(i.limiteSemanalCompensado) ||
        i.limiteSemanalCompensado <= 0 ||
        i.limiteSemanalCompensado > 168
      )
        add("sec-tipo", "#act-pico", "Informe o teto semanal autorizado.");
    }
  }
  if (state.coberturaAtiva) {
    if (!state.demandasCobertura?.length)
      add(
        "sec-cobertura",
        "#cobertura-form",
        "Cadastre ao menos uma faixa ou desative a cobertura operacional.",
      );
    for (const d of state.demandasCobertura || []) {
      const erro = validarDemanda(d);
      if (erro) add("sec-cobertura", "#cobertura-lista", `Cobertura: ${erro}`);
    }
  }
  if (destino) {
    const [ano, mes] = String(destino.periodo || "")
      .split("-")
      .map(Number);
    if (
      !escalaFixa(state) && (
      !/^\d{4}-\d{2}$/.test(destino.periodo || "") ||
      ano < 2026 ||
      ano > 2100 ||
      mes < 1 ||
      mes > 12)
    )
      add(
        "sec-gerar",
        "#conversao-periodo",
        "Informe um mês e ano válidos para a proposta.",
      );
    if (!["automatico", "transicao42", "definitivo40"].includes(destino.fase))
      add("sec-gerar", "#conversao-fase", "Selecione a referência da mudança.");
    if (!["distribuir", "fim_semana"].includes(destino.folgas))
      add(
        "sec-gerar",
        "#conversao-folgas",
        "Selecione o modelo de folgas da proposta.",
      );
  }
  return pendencias;
}
