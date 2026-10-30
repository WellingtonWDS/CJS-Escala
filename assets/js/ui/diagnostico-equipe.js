import { escapeHtml } from "../shared/formatacao.js";
import { dateFromKey, formatDateBR } from "../domain/datas-horas.js";
import { TITULOS_DIAGNOSTICO as titulos, CAUSAS_DIAGNOSTICO as causas } from "../domain/diagnostico-equipe.js";
export function renderDiagnosticoEquipe(d) {
  if (!d || d.status === "nao_avaliada") return "";
  const insuficiente = d.status === "capacidade_insuficiente";
  return `<section data-diagnostico-equipe data-status="${escapeHtml(d.status)}" class="diagnostico-equipe">
 <span class="diagnostico-etiqueta">${insuficiente ? "Capacidade insuficiente" : d.status === "redistribuicao" ? "Distribuição a ajustar" : "Análise da operação"}</span>
 <h3>Diagnóstico da equipe e contratação</h3><p><b>${titulos[d.status]}</b></p>
 <p>${d.referenciaInferida ? "Sem cobertura operacional informada, usamos a presença da escala atual como referência. A necessidade de reforço é condicional à manutenção dessa presença, sem presumir funcionamento durante os intervalos." : "As conclusões abaixo usam a demanda operacional cadastrada, as habilitações e as disponibilidades da equipe."}</p>
 ${d.picoDeficitMinimo ? `<p>Faltam simultaneamente pelo menos <b>${d.picoDeficitMinimo} pessoa(s)</b> em parte do período. Esse pico não é o número exato de contratações.</p>` : ""}
 ${d.avisos.length ? `<aside class="diagnostico-nota">${d.avisos.map(a=>`<p>${escapeHtml(a)}</p>`).join("")}</aside>` : ""}
 ${d.provas.length ? `<details class="diagnostico-detalhes" ${insuficiente ? "open" : ""}><summary>Por que o quadro não comporta a operação? (${d.provas.length} verificações)</summary><ul class="diagnostico-provas">${d.provas.map(p=>`<li>${escapeHtml(p.mensagem)}</li>`).join("")}</ul></details>` : ""}
 ${d.grupos.length ? `<h4 class="diagnostico-subtitulo">Onde a cobertura precisa de atenção</h4><div class="diagnostico-faixas">${d.grupos.map(g=>`<article data-diagnostico-faixa class="diagnostico-faixa"><h4>${escapeHtml(g.resumo)}</h4><p>${causas[g.tipo]}</p><details><summary>${g.ocorrencias} ocorrência(s) — ver datas</summary><p>${g.datas.map(data=>formatDateBR(dateFromKey(data))).join(", ")}</p></details></article>`).join("")}</div>` : ""}
 <p class="diagnostico-proximo"><b>Ação recomendada:</b> ${insuficiente ? "Planeje reforço na função e nos horários indicados, reveja as disponibilidades ou redimensione a operação. O déficit pode exigir cobertura parcial ou temporária; a quantidade exata de contratações depende dos turnos e contratos escolhidos." : d.status === "redistribuicao" ? "Teste Buscar ajustes de cobertura e confira as mudanças antes de aplicar. Ter capacidade total não assegura uma distribuição viável." : "Confira jornada, intervalos, descansos e pendências antes de utilizar a escala."}</p>
 <details class="diagnostico-detalhes"><summary>Premissas e limites desta análise</summary><div class="diagnostico-premissas"><p>A análise não duplica pessoas habilitadas para várias funções. Os tetos de capacidade são otimistas: saldo de horas não garante uma escala viável. Uma busca sem sugestões não comprova necessidade de contratar. Ausências temporárias podem exigir cobertura temporária. As datas identificam as ocorrências; não significam falta em todas as semanas.</p>${(d.limitacoes || []).map(a=>`<p>${escapeHtml(a)}</p>`).join("")}</div></details></section>`;
}
