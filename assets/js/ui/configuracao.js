import { diasNoMes } from "../domain/datas-horas.js";
import { MESES, TIPOS, TIPO_INFO } from "../config/regras-jornada.js";

export function createConfiguracaoUI({
  state,
  domain,
  storage,
  env,
  invalidarEscala,
  renderJornadaSection,
  renderResumo,
  atualizarCargaSemanalMsg,
  renderFeriados,
  onInstrumentoChange = () => {},
  onModeloChange = () => {},
}) {
  const { regimeAtual, inicializarFeriadosDoMes, arquivarFeriados } = domain;
  const { saveState } = storage;
  const { document } = env;

  function renderModeloEscala() {
    const fixa = state.modeloEscala === "fixa";
    const select = document.getElementById("cfg-modelo");
    select.value = fixa ? "fixa" : "dinamica";
    document.getElementById("cfg-modelo-descricao").textContent = fixa
      ? "Um padrão de segunda a domingo, com os mesmos horários e folgas, que se repete em qualquer mês. A etapa Feriados não se aplica."
      : "Escolha o mês e o ano. A escala acompanha as datas, os feriados e as exceções individuais do período.";
    document.getElementById("config-referencia-fixa").hidden = !fixa;
    for (const [seletor, texto] of [
      ["#sec-config > p", "1. Informe os colaboradores, horários e folgas atuais. O padrão fixo repete a mesma semana; escolha a referência jurídica e, ao final, a fase da proposta 5×2."],
      ["#sec-gerar > p", "2. Escolha a fase e as folgas da proposta fixa. A escala atual será preservada. A comparação e a cobertura representam uma semana recorrente, sem feriados."],
    ]) {
      const paragrafo = document.querySelector(seletor);
      if (paragrafo) {
        paragrafo.dataset.textoDinamico ??= paragrafo.textContent;
        paragrafo.textContent = fixa ? texto : paragrafo.dataset.textoDinamico;
      }
    }
    for (const id of ["cfg-mes", "cfg-ano", "cfg-diaInicio"])
      document.getElementById(id).parentElement.hidden = fixa;
    const referencia = document.getElementById("cfg-referencia-fixa");
    referencia.value = state.dataReferenciaFixa;
    referencia.onchange = () => {
      state.dataReferenciaFixa = referencia.value;
      invalidarEscala();
      renderRegimeAlerta();
      saveState();
    };
    select.onchange = () => {
      state.modeloEscala = select.value;
      invalidarEscala();
      renderModeloEscala();
      renderJornadaSection();
      renderRegimeAlerta();
      onModeloChange();
      saveState();
    };
    document.getElementById("proposta-resumo-grade").textContent = fixa ? "Escala proposta 5×2 — clique para editar em todas as semanas" : "Escala proposta 5×2 — clique nas células para ajustar";
    document.getElementById("geracao-orientacao-edicao").textContent = fixa
      ? "Clique no card para editar o status e os horários. Na escala fixa, a alteração vale para o mesmo dia da semana em todo o padrão. Confira o resumo semanal e a cobertura após cada edição."
      : "Após gerar, clique nas células para ajustar trabalho e folgas. As validações e os totais acompanham cada alteração. Use FC somente quando houver folga compensatória efetivamente prevista.";
    document.getElementById("conversao-periodo").parentElement.hidden = fixa;
    const automatico = document.querySelector('#conversao-fase option[value="automatico"]');
    automatico.textContent = fixa ? "Automática — na data de referência" : "Automática — vigência nas datas";
    const feriadosCobertura = document.getElementById("cobertura-feriados");
    if (feriadosCobertura) feriadosCobertura.closest("label").hidden = fixa;
    const turnos = document.getElementById("tg-turnos").closest("label").parentElement;
    turnos.querySelector(".font-semibold").textContent = fixa ? "Jornada em 2 turnos fixos" : "Jornada em 2 turnos (revezamento)";
    turnos.querySelector(".text-slate-500").textContent = fixa ? "Divide a equipe em Turno A e Turno B, mantendo os grupos toda semana" : "Divide a equipe em Turno A e Turno B, trocando semanalmente";
  }

  function renderRegimeControls() {
    const sel = document.getElementById("regime-jornada");
    sel.value =
      state.modoRegime === "simulacao" ? state.regimeJornada : "automatico";
    sel.onchange = (e) => {
      state.modoRegime =
        e.target.value === "automatico" ? "automatico" : "simulacao";
      if (state.modoRegime === "simulacao")
        state.regimeJornada = e.target.value;
      invalidarEscala();
      renderTipoEscala();
      renderJornadaSection();
      renderResumo();
      renderRegimeAlerta();
      saveState();
    };

    const comp = document.getElementById("instrumento-compensacao");
    comp.value = state.instrumentoCompensacao;
    comp.onchange = (e) => {
      state.instrumentoCompensacao = e.target.value;
      onInstrumentoChange();
      invalidarEscala();
      renderRegimeAlerta();
      atualizarCargaSemanalMsg();
      saveState();
    };
    const campos = {
      "act-identificacao": "identificacao",
      "act-inicio": "inicio",
      "act-fim": "fim",
      "act-compativel": "compativelEC141",
      "act-diaria": "compensacaoDiaria",
      "act-limite": "limiteDiario",
      "act-mensal": "repousoMensal",
      "act-12x36": "regime12x36",
      "act-intervalo-computado": "intervaloComputado",
      "act-credito-noturno": "creditoNoturnoUmaHora",
      "act-horas": "compensacaoHoras",
      "act-apuracao-inicio": "apuracaoInicio",
      "act-apuracao-fim": "apuracaoFim",
      "act-pico": "limiteSemanalCompensado",
    };
    for (const [id, campo] of Object.entries(campos)) {
      const input = document.getElementById(id);
      input.value = state.instrumentoColetivo[campo];
      input.checked = state.instrumentoColetivo[campo] === true;
      input.onchange = (e) => {
        state.instrumentoColetivo[campo] =
          e.target.type === "checkbox"
            ? e.target.checked
            : ["limiteDiario", "limiteSemanalCompensado"].includes(campo)
              ? Number(e.target.value)
              : e.target.value;
        onInstrumentoChange();
        invalidarEscala();
        saveState();
      };
    }
    renderRegimeAlerta();
  }

  function renderRegimeAlerta() {
    const el = document.getElementById("regime-alerta");
    const r = regimeAtual();
    let msg = "";

    if (r.futuro) {
      msg = `Etapa selecionada: ${r.horas}h/semana e ${r.folgas} dias de repouso remunerado, aplicáveis a partir de ${r.horas === 42 ? "16/12/2026" : "16/12/2027"}, conforme a EC 141, publicada no DOU de 16/10/2026, edição extra.`;
      if (state.tipoEscala === "6x1") {
        msg +=
          " A escala 6×1 deixa de ser o modelo geral nesta etapa, pela exigência de dois repousos semanais; eventual compensação excepcional depende de acordo ou convenção coletiva, nos limites da EC 141.";
      }
    } else {
      msg =
        "Etapa anterior à primeira fase: referência de até 44h semanais, até 15/12/2026, conforme a transição da EC 141, sem presumir que toda escala 5×2 seja automaticamente válida. Compensações e regimes especiais devem ter a base jurídica adequada.";
    }

    if (state.instrumentoCompensacao === "nenhuma") {
      msg +=
        " Se a programação ultrapassar 8h/dia ou exigir compensação, o sistema marcará a necessidade de análise do fundamento aplicável.";
    }
    const fim = regimeAtual(
      new Date(state.ano, state.mes, diasNoMes(state.mes, state.ano)),
    );
    el.textContent =
      (state.modoRegime === "simulacao"
        ? "SIMULAÇÃO: fase escolhida manualmente; não equivale à adequação nas datas da escala. "
        : state.modeloEscala === "fixa" ? `Padrão fixo: vigência na referência ${state.dataReferenciaFixa}. ` : "Vigência automática nas datas da escala. ") +
      msg +
      (r.chave !== fim.chave
        ? " Este mês atravessa uma mudança de fase; as semanas de transição serão sinalizadas."
        : "");
  }

  function renderConfigSelects() {
    renderModeloEscala();
    const selMes = document.getElementById("cfg-mes");
    selMes.innerHTML = MESES.map(
      (m, i) =>
        `<option value="${i}" ${i === state.mes ? "selected" : ""}>${m}</option>`,
    ).join("");
    const selAno = document.getElementById("cfg-ano");
    const atual = new Date().getFullYear();
    const anos = Array.from({ length: 8 }, (_, i) => atual - 2 + i);
    if (!anos.includes(state.ano)) anos.push(state.ano);
    anos.sort((a, b) => a - b);
    selAno.innerHTML = anos
      .map(
        (a) =>
          `<option value="${a}" ${a === state.ano ? "selected" : ""}>${a}</option>`,
      )
      .join("");

    selMes.onchange = (e) => {
      arquivarFeriados();
      state.mes = Number(e.target.value);
      invalidarEscala();
      inicializarFeriadosDoMes();
      renderFeriados();
      renderDiaInicioOptions();
      renderJornadaSection();
      saveState();
    };
    selAno.onchange = (e) => {
      arquivarFeriados();
      state.ano = Number(e.target.value);
      invalidarEscala();
      inicializarFeriadosDoMes();
      renderFeriados();
      renderDiaInicioOptions();
      renderJornadaSection();
      saveState();
    };
    renderDiaInicioOptions();
  }

  function renderDiaInicioOptions() {
    const total = diasNoMes(state.mes, state.ano);
    const sel = document.getElementById("cfg-diaInicio");
    if (state.diaInicio < 1 || state.diaInicio > total) state.diaInicio = 1;
    let opts = "";
    for (let d = 1; d <= total; d++) {
      opts += `<option value="${d}" ${d === state.diaInicio ? "selected" : ""}>Dia ${d}${d === 1 ? " (mês completo)" : ""}</option>`;
    }
    sel.innerHTML = opts;
    sel.onchange = (e) => {
      state.diaInicio = Number(e.target.value);
      renderJornadaSection();
      invalidarEscala();
      saveState();
    };
  }

  function renderTipoEscala() {
    const wrap = document.getElementById("tabs-tipo");
    wrap.innerHTML = TIPOS.map(([val, label]) => {
      const active = state.tipoEscala === val;
      return `<button data-tipo="${val}" aria-pressed="${active}" class="px-4 py-2.5 rounded-lg border-[1.5px] font-semibold text-sm ${active ? "border-fintria-verde bg-fintria-verdeBg text-fintria-verde" : "border-slate-200 bg-white text-slate-500"}">${label}</button>`;
    }).join("");

    wrap.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        state.tipoEscala = btn.dataset.tipo;
        if (state.diasTrabalho.length === 0) {
          state.diasTrabalho =
            state.tipoEscala === "6x1" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
        }
        if (state.tipoEscala === "custom" && state.diasTrabalho.length === 0)
          state.diasTrabalho = [1, 2, 3, 4, 5];
        invalidarEscala();
        renderTipoEscala();
        renderJornadaSection();
        renderResumo();
        renderRegimeAlerta();
        saveState();
      };
    });
    document.getElementById("tipo-desc").textContent =
      TIPO_INFO[state.tipoEscala];
    renderRegimeControls();
  }

  return {
    renderRegimeControls,
    renderModeloEscala,
    renderRegimeAlerta,
    renderConfigSelects,
    renderDiaInicioOptions,
    renderTipoEscala,
  };
}
