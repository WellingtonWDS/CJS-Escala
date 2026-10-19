import { timeToMin } from "../domain/datas-horas.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";

export function createJornadaFolgasUI({
  state,
  storage,
  env,
  invalidarEscala,
  atualizarCargaSemanalMsg,
}) {
  const { saveState } = storage;
  const { document } = env;

  function renderPicker(containerId, arr, onChange) {
    const el = document.getElementById(containerId);
    el.innerHTML = DIAS_SEMANA.map((d, i) => {
      const on = arr.includes(i);
      return `<button type="button" data-day="${i}" class="w-11 py-2 text-center border-[1.5px] rounded-md font-semibold text-xs ${on ? "bg-fintria-verde border-fintria-verde text-white" : "border-slate-200 bg-white text-slate-500"}">${d}</button>`;
    }).join("");
    el.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        const day = Number(btn.dataset.day);
        const i = arr.indexOf(day);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(day);
        arr.sort((a, b) => a - b);
        invalidarEscala();
        onChange();
      };
    });
  }

  function refreshDiasTrabalho() {
    renderPicker("weekday-picker", state.diasTrabalho, () => {
      if (state.tipoEscala === "5x2" && state.diasTrabalho.length !== 5) {
        /* não bloqueia: permite configuração personalizada, mas sinaliza abaixo */
      }
      refreshDiasTrabalho();
    });
    if (state.horarioPorDia) renderJornadaPorDia();
    atualizarCargaSemanalMsg();
  }

  function refreshFolgaPermitidos() {
    renderPicker("folga-dias-permitidos", state.folgaDiasPermitidos, () => {
      refreshFolgaPermitidos();
    });
    saveState();
  }

  function renderJornadaSection() {
    const oculta = ["12x36"].includes(state.tipoEscala);
    document.getElementById("dias-trabalho-wrap").style.display = oculta
      ? "none"
      : "block";
    document.getElementById("tg-horario-dia").checked =
      state.horarioPorDia && state.tipoEscala !== "12x36";
    document.getElementById("tg-horario-dia").disabled =
      state.tipoEscala === "12x36";
    document.getElementById("tg-turnos").checked =
      state.turnosRevezamento && state.tipoEscala !== "12x36";
    document.getElementById("tg-turnos").disabled =
      state.tipoEscala === "12x36";
    Object.entries(JMAP).forEach(
      ([id, field]) =>
        (document.getElementById(id).value = state.jornada[field]),
    );
    document.getElementById("entrada-turno-b").value = state.entradaTurnoB;
    document.getElementById("ancora-12x36").value = state.ancora12x36;
    document
      .getElementById("jornada-padrao-grid")
      .classList.toggle(
        "hidden",
        state.horarioPorDia && state.tipoEscala !== "12x36",
      );
    document
      .getElementById("jornada-por-dia-wrap")
      .classList.toggle(
        "hidden",
        !state.horarioPorDia || state.tipoEscala === "12x36",
      );
    if (state.horarioPorDia) renderJornadaPorDia();
    refreshDiasTrabalho();
    atualizarCargaSemanalMsg();
  }

  function renderJornadaPorDia() {
    const wrap = document.getElementById("jornada-por-dia-wrap");
    const dias = [...state.diasTrabalho].sort((a, b) => a - b);
    if (!dias.length) {
      wrap.innerHTML =
        '<p class="text-slate-500 text-sm">Selecione os dias trabalhados para configurar os horários.</p>';
      return;
    }
    wrap.innerHTML = dias
      .map((day) => {
        const j = state.jornadaPorDia[day] || state.jornada;
        return `<div class="grid grid-cols-2 md:grid-cols-5 gap-2.5 items-end border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div class="text-sm font-semibold text-fintria-navy">${DIAS_SEMANA[day]}</div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1">Entrada</label><input type="time" data-day="${day}" data-field="entrada" value="${j.entrada}" class="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1">Int. início</label><input type="time" data-day="${day}" data-field="intInicio" value="${j.intInicio}" class="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1">Int. fim</label><input type="time" data-day="${day}" data-field="intFim" value="${j.intFim}" class="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1">Saída</label><input type="time" data-day="${day}" data-field="saida" value="${j.saida}" class="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm"></div>
    </div>`;
      })
      .join("");
    wrap.querySelectorAll("input").forEach((inp) => {
      inp.onchange = (e) => {
        const day = Number(e.target.dataset.day),
          field = e.target.dataset.field;
        if (!state.jornadaPorDia[day])
          state.jornadaPorDia[day] = { ...state.jornada };
        state.jornadaPorDia[day][field] = e.target.value;
        invalidarEscala();
        atualizarCargaSemanalMsg();
        saveState();
      };
    });
  }

  function renderFolgasSection() {
    const tipo = document.getElementById("folga-tipo");
    tipo.value = state.folgaTipo;
    tipo.onchange = (e) => {
      state.folgaTipo = e.target.value;
      invalidarEscala();
      saveState();
    };

    const cobertura = document.getElementById("folga-cobertura");
    cobertura.value = state.folgaCobertura;
    cobertura.onchange = (e) => {
      state.folgaCobertura = e.target.value;
      invalidarEscala();
      saveState();
    };

    refreshFolgaPermitidos();
  }

  const JMAP = {
    "j-entrada": "entrada",
    "j-int-ini": "intInicio",
    "j-int-fim": "intFim",
    "j-saida": "saida",
  };
  return {
    renderPicker,
    refreshDiasTrabalho,
    refreshFolgaPermitidos,
    renderJornadaSection,
    renderJornadaPorDia,
    renderFolgasSection,
    bindEvents,
  };
  function bindEvents() {
    Object.entries(JMAP).forEach(([id, field]) => {
      const el = document.getElementById(id);
      el.value = state.jornada[field];
      el.onchange = (e) => {
        state.jornada[field] = e.target.value;
        invalidarEscala();
        atualizarCargaSemanalMsg();
        saveState();
      };
    });

    document.getElementById("tg-horario-dia").onchange = (e) => {
      state.horarioPorDia = e.target.checked;
      invalidarEscala();
      renderJornadaSection();
      saveState();
    };

    document.getElementById("tg-turnos").onchange = (e) => {
      state.turnosRevezamento = e.target.checked;
      invalidarEscala();
      saveState();
    };

    document.getElementById("entrada-turno-b").onchange = (e) => {
      if (!Number.isFinite(timeToMin(e.target.value))) return;
      state.entradaTurnoB = e.target.value;
      invalidarEscala();
      saveState();
    };
    document.getElementById("ancora-12x36").onchange = (e) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
      state.ancora12x36 = e.target.value;
      invalidarEscala();
      saveState();
    };
  }
}
