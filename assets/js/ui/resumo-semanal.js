import { dateFromKey, fmtHoras, formatDateBR } from "../domain/datas-horas.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { escapeHtml } from "../shared/formatacao.js";

export function renderResumoSemanal(x, { semana = "", fixa = false } = {}) {
  const badge =
    x.estado === "ok"
      ? '<span class="px-1.5 py-0.5 rounded bg-fintria-verdeBg text-fintria-verde font-bold">HORAS OK</span>'
      : x.estado === "acima"
        ? '<span class="px-1.5 py-0.5 rounded bg-fintria-vermelhoBg text-fintria-vermelho font-bold">ACIMA</span>'
        : x.estado === "abaixo"
          ? '<span class="px-1.5 py-0.5 rounded bg-fintria-ambarBg text-fintria-ambar font-bold">ABAIXO</span>'
          : '<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">PARCIAL</span>';
  const folgas = x.folgas
    .map((d) => {
      if (fixa) return DIAS_SEMANA[d.weekday];
      const dt = dateFromKey(d.data);
      return dt
        ? `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`
        : d.data;
    })
    .join(", ");
  return `<div data-resumo-semanal data-colaborador="${x.r.colaborador.id}" data-semana="${semana}" class="pb-2 mb-2 border-b border-slate-200 last:border-0 last:mb-0 last:pb-0">
<div class="flex items-start justify-between gap-1"><b class="text-fintria-navy">${escapeHtml(x.r.colaborador.nome || "(sem nome)")}</b>${badge}</div>
<div class="text-slate-600 mt-0.5" title="O fechamento de horas não substitui as validações de jornada e enquadramento">${fmtHoras(x.trabalhadas)} trabalhadas${x.abonadas ? ` + ${fmtHoras(x.abonadas)} abonadas` : ""}${x.creditosIntervalo ? ` + ${fmtHoras(x.creditosIntervalo)} de intervalo computado (CCT)` : ""}${x.creditosNoturnos ? ` + ${fmtHoras(x.creditosNoturnos)} de crédito noturno (CCT)` : ""}${Number.isFinite(x.alvo) ? ` · total ${fmtHoras(x.computadas)} / alvo ${fmtHoras(x.alvo)}` : ""}</div>
${x.ausencias.length ? `<div class="text-slate-600 mt-1">${x.ausencias.map((a) => `${escapeHtml(a.descricao)}: ${formatDateBR(dateFromKey(a.data))}`).join(" · ")}. ${fmtHoras(x.dispensadas)} previstas retiradas da meta de alocação; sem compensação automática.${x.semDiasAlocaveis ? " Sem dias de trabalho previstos fora da ausência nesta semana." : ""}</div>` : ""}
${x.abonos.map((a) => `<div class="text-fintria-azul mt-1">Abono de feriado: ${formatDateBR(dateFromKey(a.data))} — ${escapeHtml(a.nome)} (${fmtHoras(a.horas)}).</div>`).join("")}
${x.contrato !== x.alvo ? `<div class="text-slate-500">Contrato de referência: ${fmtHoras(x.contrato)}. ${x.dispensadas ? "Meta de alocação ajustada aos períodos de ausência informados." : "Alvo ajustado à fase, sem alteração salarial."}</div>` : ""}
<div class="text-slate-500">Folgas: ${folgas || "nenhuma"}</div>
        </div>`;
}
