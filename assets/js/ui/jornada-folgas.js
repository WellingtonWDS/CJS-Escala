import { escapeHtml } from "../shared/formatacao.js";
import { timeToMin, addDays, formatDateBR } from "../domain/datas-horas.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";

export function createJornadaFolgasUI({
  state,
  domain,
  onTurnosChange,
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
      return `<button type="button" data-day="${i}" aria-pressed="${on}" class="w-11 py-2 text-center border-[1.5px] rounded-md font-semibold text-xs ${on ? "bg-fintria-verde border-fintria-verde text-white" : "border-slate-200 bg-white text-slate-500"}">${d}</button>`;
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

  function renderResumoTurnos() {
    const ativo = state.turnosRevezamento && state.tipoEscala !== "12x36";
    document.getElementById("turnos-config").hidden = !ativo;
    const resumo = document.getElementById("turnos-resumo");
    if (!ativo) {
      resumo.innerHTML = "";
      return;
    }
    const inicio = new Date(state.ano, state.mes, state.diaInicio);
    resumo.innerHTML = (state.modeloEscala === "fixa" ? [inicio] : [inicio, addDays(inicio, 7)])
      .map((data) => {
        const grupos = ["A", "B"]
          .map((turno) => {
            const pessoas = state.colaboradores.filter(
              (_, i) => domain.obterTurno(data, i) === turno,
            );
            return `<div class="rounded-lg border border-slate-200 bg-white px-3 py-2"><b>Turno ${turno} · entrada ${turno === "B" ? state.entradaTurnoB : state.horarioPorDia ? "por dia" : state.jornada.entrada}</b><div class="text-xs text-slate-500 mt-1">${pessoas.map((p) => escapeHtml(p.nome || "(sem nome)")).join(", ") || "Sem colaboradores neste grupo"}</div></div>`;
          })
          .join("");
        return `<div><div class="text-xs font-semibold text-fintria-navySoft mb-2">${state.modeloEscala === "fixa" ? "Grupos fixos em todas as semanas" : `Semana que contém ${formatDateBR(data)}`}</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${grupos}</div></div>`;
      })
      .join("");
  }
  function aplicarTurnos() {
    renderResumoTurnos();
    if (state.escalaGerada) onTurnosChange();
    else invalidarEscala();
    saveState();
  }

  function renderJornadaSection() {
    const oculta = ["12x36"].includes(state.tipoEscala);
    document.getElementById("ciclo-12x36-config").hidden = !oculta;
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
    renderResumoTurnos();
    renderFolgasSection();
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
    const fixa = state.modeloEscala === "fixa";
    tipo.querySelector('option[value="rotativa"]').disabled = fixa;
    const fimSemana = state.tipoEscala === "5x2" && state.folgasFimSemana;
    document.getElementById("folga-fim-semana-opcao").disabled =
      state.tipoEscala !== "5x2";
    tipo.value = fimSemana ? "fim_semana" : fixa ? "fixa" : state.folgaTipo;
    document.getElementById("folga-dias-wrap").hidden = fimSemana;
    document.getElementById("folga-dias-label").textContent =
      fixa || state.folgaTipo === "fixa"
        ? "Dias para folgas fixas adicionais"
        : "Dias permitidos para rotação";
    document.getElementById("folga-modelo-explicacao").textContent = fixa
      ? "No padrão fixo, as folgas se repetem toda semana. Dias não operacionais e restrições semanais já contam como repouso; os primeiros dias permitidos completam as folgas adicionais. Na conversão, as folgas são fixadas por colaborador para buscar cobertura. Feriados não alteram esse padrão."
      : fimSemana
      ? "Todos os colaboradores folgam aos sábados e domingos, em todas as semanas. Os dias operacionais da empresa permanecem como cadastrados. Um feriado não trabalhado durante a semana não desloca essas folgas fixas e pode resultar em um dia adicional sem expediente."
      : state.folgaTipo === "fixa"
        ? "Dias não operacionais já contam como folga. As folgas adicionais são escolhidas sempre nos primeiros dias permitidos selecionados, até completar a quantidade da escala. Para garantir sábado e domingo, use o modelo pronto do 5×2."
        : "Dias não operacionais e feriados não trabalhados já contam como folga. As folgas restantes alternam entre os dias selecionados. O modelo de sábado e domingo está disponível na escala 5×2.";
    tipo.onchange = (e) => {
      state.folgasFimSemana = e.target.value === "fim_semana";
      if (!state.folgasFimSemana) state.folgaTipo = e.target.value;
      invalidarEscala();
      renderFolgasSection();
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
    renderResumoTurnos,
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
      aplicarTurnos();
    };

    document.getElementById("entrada-turno-b").onchange = (e) => {
      if (!Number.isFinite(timeToMin(e.target.value))) return;
      state.entradaTurnoB = e.target.value;
      aplicarTurnos();
    };
    document.getElementById("ancora-12x36").onchange = (e) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
      state.ancora12x36 = e.target.value;
      invalidarEscala();
      saveState();
    };
  }
}
