import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { normalizarJornada, horarioComDia } from "../domain/datas-horas.js";
import { escapeHtml } from "../shared/formatacao.js";

export function createResumoUI({ state, env, domain }) {
  const { document } = env;

  function atualizarCargaSemanalMsg() {
    const msgEl = document.getElementById("carga-semanal-msg");
    if (!msgEl) return;

    const dias = state.diasTrabalho.length;
    if (!dias) {
      msgEl.innerHTML =
        '<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-ambarBg text-fintria-ambar">Nenhum dia operacional selecionado. A jornada padrão define apenas os horários de funcionamento da empresa; a jornada semanal contratual é informada individualmente por colaborador.</div>';
      renderResumo();
      return;
    }

    msgEl.innerHTML = `<div class="rounded-lg px-3.5 py-2.5 text-sm bg-fintria-azulBg text-fintria-azul">Jornada padrão = <b>horário operacional da empresa</b>. O sistema não considera esta configuração, isoladamente, como carga horária contratual nem a compara com 40h/42h/44h. A jornada semanal de cada colaborador é definida na seção de colaboradores e será validada quando a escala for gerada.</div>`;
    if (state.horarioPorDia)
      msgEl.innerHTML +=
        '<p class="text-xs text-slate-500 mt-2">A distribuição respeita os horários máximos de cada dia, inclusive sábados reduzidos. A carga restante é distribuída nos outros dias com disponibilidade; se não couber, o resumo semanal indica o déficit.</p>';
    renderResumo();
  }

  function renderResumo() {
    const grid = document.getElementById("resumo-grid");
    const dias = [...state.diasTrabalho].sort((a, b) => (a + 6) % 7 - (b + 6) % 7);
    const nomes = dias.map((d) => DIAS_SEMANA[d]).join(", ") || "Nenhum";
    const horarios = dias.map(dia => ({dia, jornada:normalizarJornada(domain.obterJornadaDoDia(dia))}));
    function valores(campo) {
      const grupos = new Map();
      for (const {dia,jornada:j} of horarios) {
        const valor = !j ? "Não informado" : campo === "intervalo"
          ? j.intervalo > 0 ? `${horarioComDia(j.intInicio)}–${horarioComDia(j.intFim)}` : "Sem intervalo"
          : horarioComDia(j[campo]);
        if (!grupos.has(valor)) grupos.set(valor,[]);
        grupos.get(valor).push(DIAS_SEMANA[dia]);
      }
      if (grupos.size <= 1) return `<div class="font-display text-lg font-bold text-fintria-navy break-words">${escapeHtml(grupos.keys().next().value || "Não informado")}</div>`;
      return `<dl class="space-y-2">${[...grupos].map(([valor,dias])=>`<div><dt class="text-xs text-slate-500">${escapeHtml(dias.join(", "))}</dt><dd class="font-display text-lg font-bold text-fintria-navy break-words">${escapeHtml(valor)}</dd></div>`).join("")}</dl>`;
    }
    grid.innerHTML = [
      ["entrada","ENTRADA DA EMPRESA"],
      ["intervalo","INTERVALO DA EMPRESA"],
      ["saida","SAÍDA DA EMPRESA"],
    ].map(([campo,titulo])=>`<div data-resumo-horario="${campo}" class="border border-slate-200 rounded-lg p-3.5 bg-slate-50 min-w-0">${valores(campo)}<div class="text-xs text-slate-500 font-semibold mt-1">${titulo}</div></div>`).join("") +
      `<div class="border border-slate-200 rounded-lg p-3.5 bg-slate-50 min-w-0"><div class="font-display text-sm font-bold text-fintria-navy leading-5">${escapeHtml(nomes)}</div><div class="text-xs text-slate-500 font-semibold">DIAS OPERACIONAIS</div></div>`;

  }

  return { atualizarCargaSemanalMsg, renderResumo };
}
