import { diasDoModelo, ocorrenciasDoModelo } from "../domain/modelo-escala.js";
import { apurarSemana } from "../domain/resumo-semanal.js";
import { analisarCobertura } from "../domain/cobertura.js";
import { diagnosticarEquipe } from "../domain/diagnostico-equipe.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { dateFromKey, formatDateBR, fmtHoras, horarioComDia } from "../domain/datas-horas.js";
import { escapeHtml as h } from "../shared/formatacao.js";

export function mensagemSemData(texto) {
  return texto.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (data) => DIAS_SEMANA[dateFromKey(data).getDay()]);
}

export function renderQuadroFixo(config, domain) {
  const escala = config.escalaGerada;
  const validacoes = escala.resultado.map((r) => ({ r,
    issues: domain.validarLegal(r.colaborador, r.dias, r.diasContexto, r.diasApuracao) }));
  // O mesmo problema diário/semanal aparece uma só vez no padrão recorrente.
  const ocorrencias = validacoes.flatMap(({ r, issues }) =>
    ocorrenciasDoModelo(config, issues).map((i) => ({ ...i, nome: r.colaborador.nome })));
  const lista = (items) => items.map((i) => `<p class="mt-2 text-sm"><b>${h(i.nome)}</b> · ${h(mensagemSemData(i.mensagem))}</p>`).join("");
  const erros = ocorrencias.filter((i) => i.severidade === "erro");
  const analises = ocorrencias.filter((i) => i.severidade !== "erro");
  const dias = [1, 2, 3, 4, 5, 6, 0];
  let html = `<p data-modelo-fixo class="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 text-sm"><b>Escala mensal fixa · padrão semanal recorrente.</b> Referência: ${formatDateBR(dateFromKey(config.dataReferenciaFixa))} · ${h(domain.regimeAtual().nome)}. ${config.modoRegime === "simulacao" ? "SIMULAÇÃO explícita." : "Vigência na referência informada."} Sem feriados ou eventos por data.${escala.referenciaAtual44 ? " Referência atual em 44h; a redução é aplicada à proposta." : ""}</p>`;
  if (erros.length) html += `<section data-erros-escala role="alert" class="border border-red-200 rounded-lg p-4 mb-4 text-fintria-vermelho"><h3 class="font-semibold">${erros.length} incompatibilidade(s). Corrija antes de utilizar o padrão.</h3>${lista(erros)}</section>`;
  html += `<div data-escala-quadro class="escala-quadro escala-fixa border border-slate-200 rounded-xl mb-5"><div class="bg-fintria-navy text-white px-4 py-3 flex items-center gap-3"><img class="escala-marca" src="/logos/Reescala_branco_transparente.png" alt="" width="36" height="32" style="width:36px;height:32px;max-width:36px;object-fit:contain;flex-shrink:0"><img class="escala-marca-impressao" src="/logos/Reescala_preto_transparente.png" alt="" width="36" height="32" style="width:36px;height:32px;max-width:36px;object-fit:contain;flex-shrink:0"><div><h3 class="font-display font-bold">Reescala · Escala mensal fixa</h3><p class="text-xs">Mesmos horários e folgas toda semana · para ajustar, altere o preenchimento e gere novamente</p></div></div>
    <div class="escala-ferramentas no-print"><span>Role horizontalmente para visualizar todos os dias e o total semanal.</span><button type="button" data-ver-resumo class="border rounded px-3 py-1">Ver resumo semanal →</button></div>
    <div data-rolagem-topo class="escala-rolagem-topo no-print" tabindex="0" role="region" aria-label="Rolagem horizontal do padrão fixo"><div data-rolagem-espaco></div></div>
    <div data-rolagem-escala class="escala-rolagem" tabindex="0" role="region" aria-label="Padrão semanal de segunda a domingo"><table class="escala-mensal border-collapse w-full text-xs"><thead><tr><th class="p-3 border bg-slate-50 text-left">Colaborador</th>${dias.map((d) => `<th class="p-3 border bg-slate-50">${DIAS_SEMANA[d]}</th>`).join("")}<th class="p-3 border bg-slate-50 text-left">Resumo semanal</th></tr></thead><tbody>`;
  for (const r of escala.resultado) {
    const semana = diasDoModelo(config, r.dias), a = apurarSemana(r.colaborador, semana, config);
    html += `<tr data-fixo-colaborador="${r.colaborador.id}"><th class="p-3 border text-left align-top"><b>${h(r.colaborador.nome)}</b><div class="text-slate-500 font-normal mt-1">${h(r.colaborador.cargo)}</div></th>`;
    for (const wd of dias) {
      const dia = semana.find((d) => d.weekday === wd), trabalha = dia && ["T", "FE"].includes(dia.status);
      html += `<td data-fixo-dia="${wd}" class="p-2 border align-top"><div class="escala-colaborador rounded border ${trabalha ? "bg-fintria-verdeBg text-fintria-verde border-fintria-verde" : "bg-fintria-azulBg text-fintria-azul border-fintria-azul"}"><div class="font-semibold">${trabalha ? "Trabalho" : dia?.sabadoCompensado ? "Sábado compensado" : "Folga"}</div>${trabalha ? `<div class="mt-1">${horarioComDia(dia.entradaMin)}–${horarioComDia(dia.saidaMin)}</div><div class="mt-1">${dia.intervaloInicioMin != null ? `Intervalo: ${horarioComDia(dia.intervaloInicioMin)}–${horarioComDia(dia.intervaloFimMin)}` : "Sem intervalo"}</div><div class="mt-1">${fmtHoras(dia.horas)} trabalhadas</div>${dia.intervaloSugerido ? '<div class="mt-1 font-semibold">Intervalo sugerido para cobertura</div>' : ""}` : ""}</div></td>`;
    }
    html += `<td data-resumo-semanal class="p-3 border align-top"><b>${fmtHoras(a.trabalhadas)} trabalhadas</b><div class="mt-1">Alvo: ${fmtHoras(a.alvo)} · ${a.estado === "ok" ? "HORAS OK" : a.estado === "acima" ? "ACIMA" : "ABAIXO"}</div><div class="mt-1">Folgas: ${semana.filter((d) => ["F", "FC", "I"].includes(d.status)).map((d) => DIAS_SEMANA[d.weekday]).join(", ")}</div></td></tr>`;
  }
  html += "</tbody></table></div></div>";
  if (config.coberturaAtiva) {
    const rel = analisarCobertura(config, escala.resultado), diagnostico = diagnosticarEquipe(config, escala.resultado, rel);
    html += `<section data-cobertura-fixa class="border rounded-lg p-4 mb-4"><h3 class="font-semibold">Cobertura semanal por horário e função</h3><p class="text-sm mt-2">${!rel.configurada || !rel.periodos.length ? "Cobertura ainda não avaliada: confira as faixas cadastradas." : rel.lacunas.length ? "Persistem horários descobertos; revise a distribuição ou a capacidade da equipe." : "Todas as faixas cadastradas estão cobertas no padrão semanal."}</p>${rel.avisos.map((a) => `<p class="text-sm mt-2">${h(a)}</p>`).join("")}
      ${rel.lacunas.length ? `<div class="overflow-x-auto mt-3"><table class="w-full text-sm"><thead><tr>${["Dia", "Função", "Horário", "Faltam"].map((s) => `<th class="p-2 text-left">${s}</th>`).join("")}</tr></thead><tbody>${rel.lacunas.map((l) => `<tr><td class="p-2">${DIAS_SEMANA[dateFromKey(l.data).getDay()]}</td><td class="p-2">${h(l.funcao)}</td><td class="p-2">${horarioComDia(l.inicioMin)}–${horarioComDia(l.fimMin)}</td><td class="p-2">${l.faltantes}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${diagnostico.grupos.map((g) => `<p class="text-sm mt-2">${h(g.resumo)}</p>`).join("")}
      <p class="text-xs text-slate-500 mt-3">Intervalos não contam como cobertura. A conversão busca folgas e intervalos fixos para reduzir lacunas. Trocas pontuais por data e a busca de ajustes avulsos estão disponíveis no modo dinâmico.</p></section>`;
  }
  html += `<details data-analises-escala class="border rounded-lg p-4"><summary class="font-semibold cursor-pointer">Análises e informações por colaborador (${analises.length})</summary>${lista(analises)}</details>`;
  return html;
}
