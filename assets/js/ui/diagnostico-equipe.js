import { escapeHtml } from "../shared/formatacao.js";
import { dateFromKey, formatDateBR } from "../domain/datas-horas.js";
import {
  TITULOS_DIAGNOSTICO as titulos,
  CAUSAS_DIAGNOSTICO as causas,
} from "../domain/diagnostico-equipe.js";
export function renderDiagnosticoEquipe(d) {
  if (!d || d.status === "nao_avaliada") return "";
  return `<section data-diagnostico-equipe data-status="${escapeHtml(d.status)}" class="rounded-lg border border-slate-200 p-4 mb-4">
 <h3 class="font-display font-semibold text-fintria-navy mb-2">Diagnóstico da equipe e contratação</h3>
 <p class="font-semibold mb-2">${titulos[d.status]}</p>
 ${d.picoDeficitMinimo ? `<p class="text-sm mb-2">Déficit mínimo simultâneo: <b>${d.picoDeficitMinimo} pessoa(s)</b>. Este pico não é o número exato de contratações.</p>` : ""}
 ${d.avisos.map((a) => `<p role="alert" class="text-sm mb-2">${escapeHtml(a)}</p>`).join("")}
 <div class="space-y-3">${d.grupos
   .slice(0, 100)
   .map(
     (g) =>
       `<div data-diagnostico-faixa class="rounded-lg bg-slate-50 border border-slate-200 p-3"><p class="font-semibold text-sm">${escapeHtml(g.resumo)}</p><p class="text-sm mt-1">${causas[g.tipo]}</p><details class="text-xs text-slate-500 mt-2"><summary class="cursor-pointer">${g.ocorrencias} ocorrência(s) identificada(s) — ver datas</summary><p class="mt-1">${g.datas.map((data) => formatDateBR(dateFromKey(data))).join(", ")}</p></details></div>`,
   )
   .join("")}</div>
 ${d.grupos.length > 100 ? '<p class="text-sm mt-2">Exibindo os primeiros 100 grupos. O CSV contém todos os grupos.</p>' : ""}
 ${
   d.provas.length
     ? `<details class="mt-3 text-sm"><summary class="cursor-pointer font-semibold">Por que falta capacidade? (${d.provas.length} verificações)</summary><ul class="list-disc pl-5 mt-2">${d.provas
         .slice(0, 100)
         .map((p) => `<li class="mb-2">${escapeHtml(p.mensagem)}</li>`)
         .join(
           "",
         )}</ul>${d.provas.length > 100 ? "<p>Todas as verificações estão no CSV.</p>" : ""}</details>`
     : ""
 }
 <p class="text-xs text-slate-500 mt-3">A análise considera somente a operação cadastrada e não duplica pessoas habilitadas para várias funções. Os tetos de capacidade são otimistas: saldo de horas não garante uma escala viável. Use “Buscar ajustes” para testar redistribuições; uma busca sem sugestões não comprova necessidade de contratar. Ausências temporárias podem exigir cobertura temporária. As datas acima identificam as ocorrências; não significam falta em todas as semanas.</p>
 ${(d.limitacoes || []).map((a) => `<p class="text-xs text-slate-500 mt-2">${escapeHtml(a)}</p>`).join("")}
 </section>`;
}
