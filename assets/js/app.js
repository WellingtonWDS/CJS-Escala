import { createEtapasUI } from "./ui/etapas.js";
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
import { bindExportEvents } from "./export/download.js";
import { createTutorialUI } from "./ui/tutorial.js";
import { createImportarColaboradoresUI } from "./ui/importar-colaboradores.js";
import { createConversaoUI } from "./ui/conversao.js";
import { createImportarDominioUI } from "./ui/importar-dominio.js";
export function createApplication({ env, now = () => new Date() }) {
  const initialState = createDefaultState(now());
  if (env.individual) {
    initialState.colaboradores = [];
    initialState.proximoId = 1;
  }
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
  let conversaoUI;
  function invalidarEscala() {
    state.escalaGerada = null;
    document.getElementById("resultado-gerar").innerHTML =
      "Configuração alterada. Gere a escala para atualizar os resultados.";
    conversaoUI?.marcarDesatualizada();
  }
  const deps = { state, domain, storage, env, invalidarEscala };
  const etapas = createEtapasUI({ ...env, state });
  const resumo = createResumoUI(deps);
  const feriados = createFeriadosUI(deps);
  const cobertura = createCoberturaUI({
    ...deps,
    onCoberturaChange: () => {
      conversaoUI?.marcarDesatualizada();
      if (state.escalaGerada) {
        state.escalaGerada.coberturaOperacional = domain.analisarCobertura(
          state.escalaGerada.resultado,
        );
        calendario.renderEscalaGerada();
      }
    },
  });
  const colaboradores = createColaboradoresUI({
    ...deps,
    ...resumo,
    onFuncoesChange: () => {
      cobertura.renderFuncoesCobertura();
      jornada.renderResumoTurnos();
    },
  });
  const jornada = createJornadaFolgasUI({
    ...deps,
    ...resumo,
    onTurnosChange: () => calendario.atualizarTurnosEscala(),
  });
  const configuracao = createConfiguracaoUI({
    ...deps,
    onInstrumentoChange() {
      colaboradores.renderColaboradores({ preservarEnquadramento: true });
      resumo.renderResumo();
    },
    ...resumo,
    ...feriados,
    ...jornada,
  });
  const calendario = createCalendarioUI({
    ...deps,
    renderRelatorioCobertura: cobertura.renderRelatorioCobertura,
    onEscalaChange: () => conversaoUI?.marcarDesatualizada(),
  });
  conversaoUI = createConversaoUI({
    ...deps,
    validarPreenchimento: etapas.validarGeracao,
    renderEscalaGerada: calendario.renderEscalaGerada,
  });
  const tutorial = createTutorialUI({ ...env, etapas });
  const importacao = createImportarColaboradoresUI({
    ...deps,
    renderColaboradores: colaboradores.renderColaboradores,
    renderResumo: resumo.renderResumo,
  });
  const dominioImportacao = createImportarDominioUI({
    ...deps,
    atualizarInterface() {
      if (!state.feriados.length) inicializarFeriadosDoMes();
      feriados.renderFeriados();
      cobertura.renderCoberturaConfig();
      colaboradores.renderColaboradores();
      configuracao.renderTipoEscala();
      jornada.renderJornadaSection();
      jornada.renderFolgasSection();
      resumo.renderResumo();
    },
  });
  const { renderResumo } = resumo;
  const { renderFeriados } = feriados;
  const { renderColaboradores } = colaboradores;
  const { renderJornadaSection, renderFolgasSection } = jornada;
  const { renderConfigSelects, renderTipoEscala, renderRegimeControls } =
    configuracao;
  const { renderEscalaGerada } = calendario;
  function bindEvents() {
    for (const ui of [
      etapas,
      feriados,
      colaboradores,
      jornada,
      calendario,
      cobertura,
      tutorial,
      importacao,
      conversaoUI,
      dominioImportacao,
    ])
      ui.bindEvents();
    bindExportEvents(state, env);
    document.getElementById("btn-limpar-dados").onclick = async () => {
      if ((await env.beforeClearState?.()) === false) return;
      if (
        await confirm(
          env.individual
            ? "Limpar o preenchimento local desta seleção? As versões salvas no servidor e os outros preenchimentos serão preservados."
            : "Isso apaga todos os dados preenchidos neste navegador. Continuar?",
          {
            title: "Limpar preenchimento",
            confirmText: "Limpar dados",
            cancelText: "Manter preenchimento",
          },
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
      f.mes ??= state.mes;
      f.ano ??= state.ano;
    });
    const hoje = now();
    const mudouPeriodo =
      !env.preserveSavedPeriod &&
      (state.mes !== hoje.getMonth() || state.ano !== hoje.getFullYear());
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
    conversaoUI.initConversao();
    dominioImportacao.renderEmpresa();
    etapas.init();
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
    ...cobertura,
    bindEvents,
  };
}
