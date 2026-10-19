import { createCoberturaUI } from "./ui/cobertura.js";
import { createDefaultState } from "./state/store.js";
import { createPersistence } from "./state/persistencia.js";
import { createDomain } from "./domain/index.js";
import { createResumoUI } from "./ui/resumo.js";
import { createFeriadosUI } from "./ui/feriados.js";
import { createColaboradoresUI } from "./ui/colaboradores.js";
import { createJornadaFolgasUI } from "./ui/jornada-folgas.js";
import { createConfiguracaoUI } from "./ui/configuracao.js";
import { createCalendarioUI } from "./ui/calendario.js";
import { createTransicaoUI } from "./ui/transicao.js";
import { bindExportEvents } from "./export/download.js";
export function createApplication({ env, now = () => new Date() }) {
  const initialState = createDefaultState(now());
  const state = structuredClone(initialState);
  const storage = createPersistence({
    state,
    initialState,
    storage: env.localStorage,
  });
  const { loadState, saveState } = storage;
  const domain = createDomain(state);
  const { inicializarFeriadosDoMes } = domain;
  const { document, confirm, location } = env;
  function invalidarEscala() {
    state.escalaGerada = null;
    document.getElementById("resultado-gerar").innerHTML =
      "Configuração alterada. Gere a escala para atualizar os resultados.";
    document.getElementById("pec-resultado").innerHTML = "";
  }
  const deps = { state, domain, storage, env, invalidarEscala };
  const resumo = createResumoUI(deps);
  const feriados = createFeriadosUI(deps);
  const cobertura = createCoberturaUI(deps);
  const colaboradores = createColaboradoresUI({
    ...deps,
    ...resumo,
    onFuncoesChange: cobertura.renderFuncoesCobertura,
  });
  const jornada = createJornadaFolgasUI({ ...deps, ...resumo });
  const configuracao = createConfiguracaoUI({
    ...deps,
    ...resumo,
    ...feriados,
    ...jornada,
  });
  const calendario = createCalendarioUI({
    ...deps,
    renderRelatorioCobertura: cobertura.renderRelatorioCobertura,
  });
  const transicao = createTransicaoUI(deps);
  const { renderResumo } = resumo;
  const { renderFeriados } = feriados;
  const { renderColaboradores } = colaboradores;
  const { renderJornadaSection, renderFolgasSection } = jornada;
  const { renderConfigSelects, renderTipoEscala, renderRegimeControls } =
    configuracao;
  const { renderEscalaGerada } = calendario;
  function bindEvents() {
    for (const ui of [
      feriados,
      colaboradores,
      jornada,
      calendario,
      transicao,
      cobertura,
    ])
      ui.bindEvents();
    bindExportEvents(state, env);
    document.getElementById("btn-limpar-dados").onclick = () => {
      if (
        confirm(
          "Isso apaga todos os dados preenchidos neste navegador. Continuar?",
        )
      ) {
        try {
          storage.clearState();
        } catch (e) {
          console.warn("Não foi possível limpar:", e);
        }
        location.reload();
      }
    };
  }
  function init() {
    const carregou = loadState();

    /* Migração simples de versões anteriores */
    if (!state.regimeJornada) state.regimeJornada = "atual44";
    if (!state.instrumentoCompensacao) state.instrumentoCompensacao = "nenhuma";
    if (state.tipoEscala === "marshall") state.tipoEscala = "custom";
    if (!Array.isArray(state.feriados)) state.feriados = [];
    state.feriados.forEach((f) => {
      if (f.tipo === "municipal" || f.tipo === "local") {
        f.mes ??= state.mes;
        f.ano ??= state.ano;
      }
    });
    const hoje = now();
    const mudouPeriodo =
      state.mes !== hoje.getMonth() || state.ano !== hoje.getFullYear();
    if (mudouPeriodo) {
      state.mes = hoje.getMonth();
      state.ano = hoje.getFullYear();
      state.diaInicio = 1;
      invalidarEscala();
      inicializarFeriadosDoMes();
    } else if (!state.feriados.length) inicializarFeriadosDoMes();
    // Descartar resultados antigos sem horários efetivos calculados.
    if (
      state.escalaGerada?.resultado?.some((r) =>
        r.dias.some((d) => !Number.isFinite(d.entradaMin)),
      )
    )
      invalidarEscala();

    if (!Array.isArray(state.demandasCobertura)) state.demandasCobertura = [];
    cobertura.renderCoberturaConfig();
    renderConfigSelects();
    renderColaboradores();
    renderFeriados();
    renderTipoEscala();
    renderJornadaSection();
    renderFolgasSection();
    renderResumo();
    renderRegimeControls();
    if (state.escalaGerada) renderEscalaGerada();
    if (!carregou || mudouPeriodo) saveState();
  }
  return {
    state,
    initialState,
    storage,
    domain,
    init,
    invalidarEscala,
    ...resumo,
    ...feriados,
    ...colaboradores,
    ...jornada,
    ...configuracao,
    ...calendario,
    ...transicao,
    ...cobertura,
    bindEvents,
  };
}
