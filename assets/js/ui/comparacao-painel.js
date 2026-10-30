import { escapeHtml as e } from "../shared/formatacao.js";
import { fmtHoras, minToTime, formatDateBR, dateFromKey } from "../domain/datas-horas.js";
import { escalaFixa } from "../domain/modelo-escala.js";
import { renderDiagnosticoEquipe } from "./diagnostico-equipe.js";
import { analisarRateioSemanal } from "../domain/rateio-semanal.js";

const titulos = {
  suficiente: "O quadro atual é suficiente para cobrir a operação informada nesta proposta 5×2.",
  insuficiente: "O quadro atual é insuficiente para manter esta operação nas condições cadastradas.",
  ajustes: "A proposta precisa de ajustes de horários ou distribuição.",
  incompativel: "A operação está coberta, mas há incompatibilidades a corrigir.",
  nao_avaliada: "Ainda não é possível concluir se o quadro atual é suficiente.",
};
const motivosRateio = {
  aplicado: "Carga semanal distribuída nos horários da proposta.",
  janela: "Os horários disponíveis não comportam todo o alvo semanal; reveja a janela de trabalho, os dias permitidos e o intervalo mínimo aplicável.",
  disponibilidade: "Os dias de trabalho disponíveis não comportam a distribuição habitual; confira férias, afastamentos, folgas e restrições individuais.",
  fundamento_coletivo: "A distribuição exigiria ultrapassar o limite diário autorizado. Confira a vigência e as condições do ACT/CCT antes de ampliar a jornada.",
};
const numeros = (m) => `<div class="diagnostico-indicadores"><div><span>Horas-pessoa descobertas</span><strong>${fmtHoras(m.faltantesDepois)}</strong><small>Antes: ${fmtHoras(m.faltantesAntes)}</small></div><div><span>Incompatibilidades</span><strong>${m.erros}</strong><small>Conferir antes de adotar</small></div><div><span>Alertas e pendências</span><strong>${m.pendencias}</strong><small>Detalhes na validação da escala</small></div></div>`;
export function renderResumoConversao(c) {
  const m = c.comparacao, inferida = m.baseCobertura === "escala_atual";
  return `<section class="diagnostico-executivo" data-situacao="${c.desatualizada ? "ajustes" : e(m.status)}" aria-label="Resumo da proposta"><span class="diagnostico-etiqueta">${c.desatualizada ? "Recalcular proposta" : "Decisão sobre a nova escala"}</span><h3>${c.desatualizada ? "Comparação desatualizada — conclusão suspensa." : inferida && m.status === "insuficiente" ? "Para manter a presença atual, será necessário reforçar a equipe ou rever a operação." : inferida && m.status === "suficiente" ? "A proposta mantém a presença observada na escala atual." : titulos[m.status]}</h3><p>${inferida ? "Referência estimada a partir dos horários efetivamente trabalhados na escala atual. Não é uma demanda operacional confirmada; os intervalos não contam como presença. A conclusão vale se a empresa precisar manter essa mesma cobertura." : "Análise das faixas, funções e quantidades informadas na cobertura operacional."}</p>${numeros(m)}<p class="diagnostico-proximo"><b>Próximo passo:</b> ${c.desatualizada ? "Gere uma nova proposta antes de decidir ou exportar." : m.erros ? "Corrija as incompatibilidades da escala. Depois, reavalie os horários descobertos." : m.status === "insuficiente" ? "Confira as funções e horários indicados no diagnóstico. Planeje reforço, cobertura parcial ou revisão da operação; o pico de faltantes não é o total exato de contratações." : m.faltantesDepois ? "Teste os ajustes de cobertura e revise as disponibilidades. Lacunas de distribuição, isoladamente, não comprovam necessidade de contratar." : "Confira a grade e os intervalos antes de salvar e compartilhar."}</p></section>`;
}
function tabela(titulo, colunas, linhas) {
  return `<details class="diagnostico-detalhes"><summary>${titulo}</summary><div class="diagnostico-tabela-scroll" tabindex="0" role="region" aria-label="${titulo}"><table class="comparacao-tabela"><thead><tr>${colunas.map(t => `<th scope="col">${t}</th>`).join("")}</tr></thead><tbody>${linhas.join("")}</tbody></table></div></details>`;
}
function rateios(config) {
  const itens = analisarRateioSemanal(config, config.escalaGerada.resultado);
  if (!itens.length) return "";
  return `<section class="diagnostico-rateio"><h3>Distribuição da carga semanal</h3><p>As horas são rateadas em minutos entre os dias de trabalho, respeitando o contrato, o limite diário, o intervalo e a janela disponível. Uma jornada de 42h em cinco dias corresponde a 8h24 por dia e exige base coletiva válida para ultrapassar 8h.</p>${itens.map(p => {
    const grupos = new Map();
    for (const s of p.semanas) {
      const chave = [s.alvoMin,s.computadosMin,s.faltantesMin,s.diasTrabalho,s.horasPorDiaMin,s.horasPorDiaMax,s.viavelLegalmente,s.motivo,s.aplicado].join("|");
      if (!grupos.has(chave)) grupos.set(chave, {s, datas:[]});
      grupos.get(chave).datas.push(s.inicio);
    }
    return `<article class="diagnostico-rateio-pessoa"><h4>${e(p.nome)}</h4>${[...grupos.values()].map(({s,datas})=>`<div class="diagnostico-rateio-item" data-rateio="${s.aplicado ? "aplicado" : "pendente"}"><b>${s.aplicado ? "Rateio aplicado" : "Rateio a revisar"}</b><p>Alvo ${fmtHoras(s.alvoMin / 60)} · computado ${fmtHoras(s.computadosMin / 60)} · ${s.diasTrabalho} dia(s) de trabalho.</p><p>${s.horasPorDiaMin != null ? `Referência por dia: <strong>${fmtHoras(s.horasPorDiaMin / 60)}${s.horasPorDiaMax !== s.horasPorDiaMin ? ` a ${fmtHoras(s.horasPorDiaMax / 60)}` : ""}</strong>. ` : ""}${s.faltantesMin > 0 ? `Faltam ${fmtHoras(s.faltantesMin / 60)} na semana. ` : ""}${e(motivosRateio[s.motivo] || s.motivo || "")}</p>${!s.aplicado && s.faltantesMin > 0 && s.diasTrabalho ? `<p><b>Sugestão:</b> distribuir aproximadamente ${fmtHoras(Math.ceil(s.faltantesMin / s.diasTrabalho) / 60)} adicionais por dia, se houver janela, intervalo e autorização aplicáveis. O sistema mantém os limites informados quando essa ampliação não cabe.</p>` : ""}<details><summary>${datas.length} semana(s) — ver referências</summary><p>${datas.map(d=>formatDateBR(dateFromKey(d))).join(", ")}</p></details></div>`).join("")}</article>`;
  }).join("")}</section>`;
}
export function renderDetalhesConversao(c) {
  const m = c.comparacao, config = c.proposta.config, fixa = escalaFixa(config);
  const hora = n => n === 1440 ? "24:00" : minToTime(n);
  return `<section class="diagnostico-conversao"><h3>${fixa ? "Comparação dos padrões semanais · 6×1 → 5×2" : "Comparação e suficiência da equipe"}</h3><p id="conversao-diagnostico">${c.desatualizada ? "Comparação desatualizada. Gere novamente antes de utilizar." : m.baseCobertura === "escala_atual" ? (m.status === "insuficiente" ? "O quadro atual é insuficiente para manter a presença atual, se essa cobertura continuar necessária." : "Sem demanda operacional confirmada, não é possível concluir se a equipe atende toda a empresa. A comparação usa a presença da escala atual.") : titulos[m.status]}</p>
  ${c.desatualizada ? "" : renderDiagnosticoEquipe(m.diagnostico)}
  ${rateios(config)}
  ${c.buscaParcial || config.escalaGerada.limiteBuscaIntervalos ? '<aside class="diagnostico-nota">A busca atingiu seu limite de processamento. As sugestões não comprovam que esta seja a melhor escala possível nem que toda lacuna exija contratação.</aside>' : ""}
  ${(m.avisos || []).length ? `<aside class="diagnostico-nota">${m.avisos.map(a=>`<p>${e(a)}</p>`).join("")}</aside>` : ""}
  ${config.escalaGerada.sugestoesIntervalos?.length ? `<p>${config.escalaGerada.sugestoesIntervalos.length} intervalo(s) redistribuído(s) na proposta para melhorar a cobertura. Confira os horários na grade.</p>` : ""}
  ${tabela("Capacidade por função no período",["Função","Demanda (h-pessoa)","Trabalho proposto (h)","Lacunas (h-pessoa)","Pico de faltantes","Explicação"],m.funcoes.map(f=>`<tr><th scope="row">${e(f.funcao)}</th><td>${fmtHoras(f.necessarias)}</td><td>${fmtHoras(f.disponiveis)}</td><td>${fmtHoras(f.faltantes)}</td><td>${f.pico}</td><td>${e(f.insuficiencias.join(" ") || (f.faltantes ? "Revise a distribuição: insuficiência do quadro não comprovada." : "Referência atendida."))}</td></tr>`))}
  ${tabela(fixa ? "Antes e depois por colaborador — semana recorrente" : "Antes e depois por colaborador — mesmo mês da proposta",["Colaborador","Função","Horas 6×1 → 5×2","Dias de trabalho","Dias sem trabalho","Semanas abaixo do alvo"],m.pessoas.map(p=>`<tr><th scope="row">${e(p.nome)}</th><td>${e(p.funcao || "Não informada")}</td><td>${fmtHoras(p.horasAntes)} → ${fmtHoras(p.horasDepois)}</td><td>${p.diasAntes} → ${p.diasDepois}</td><td>${p.folgasAntes} → ${p.folgasDepois}</td><td>${p.deficits}</td></tr>`))}
  ${m.lacunas.length ? tabela(`Horários descobertos (${m.lacunas.length} faixas)`,[fixa?"Referência da semana":"Data","Função","Horário","Necessários","Presentes","Faltantes"],m.lacunas.map(l=>`<tr><td>${formatDateBR(dateFromKey(l.data))}</td><td>${e(l.funcao)}</td><td>${hora(l.inicioMin)}–${hora(l.fimMin)}</td><td>${l.necessarios}</td><td>${l.presentes}</td><td>${l.faltantes}</td></tr>`)) : ""}
  <p class="diagnostico-rodape">A origem foi preservada. ${fixa ? "Uma semana recorrente, sem feriados; a data de referência determina a fase jurídica." : `Os dois padrões foram comparados em ${config.mes + 1}/${config.ano}, com feriados e restrições desse período.`} Saldo de horas não garante cobertura em todos os horários. A análise orienta a decisão e não certifica a regularidade da escala.</p></section>`;
}
