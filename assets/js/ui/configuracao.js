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
}) {
  const { regimeAtual, inicializarFeriadosDoMes } = domain;
  const { saveState } = storage;
  const { document } = env;

  function renderRegimeControls() {
    const sel = document.getElementById("regime-jornada");
    sel.value = state.regimeJornada;
    sel.onchange = (e) => {
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
      invalidarEscala();
      renderRegimeAlerta();
      atualizarCargaSemanalMsg();
      saveState();
    };
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
    el.textContent = msg;
  }

  function renderConfigSelects() {
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
      state.mes = Number(e.target.value);
      invalidarEscala();
      inicializarFeriadosDoMes();
      renderFeriados();
      renderDiaInicioOptions();
      renderJornadaSection();
      saveState();
    };
    selAno.onchange = (e) => {
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
      return `<button data-tipo="${val}" class="px-4 py-2.5 rounded-lg border-[1.5px] font-semibold text-sm ${active ? "border-fintria-verde bg-fintria-verdeBg text-fintria-verde" : "border-slate-200 bg-white text-slate-500"}">${label}</button>`;
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
    renderRegimeAlerta,
    renderConfigSelects,
    renderDiaInicioOptions,
    renderTipoEscala,
  };
}
