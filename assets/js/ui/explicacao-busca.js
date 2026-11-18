import { escapeHtml as h } from "../shared/formatacao.js";
import {
  horarioComDia,
  formatDateBR,
  dateFromKey,
} from "../domain/datas-horas.js";

const ENCERRAMENTO = {
  objetivos_atendidos:
    "As faixas cadastradas e o saldo contratual das semanas completas foram atendidos.",
  sem_alternativas:
    "Nenhuma alternativa chegou à avaliação completa com as configurações preservadas. Confira a triagem abaixo; zero tentativas não significa falha no processamento.",
  sem_melhoria:
    "A busca parou porque não encontrou outra melhoria segura entre as alternativas que gerou.",
  limite_tempo:"A janela de tempo da busca foi atingida. Confira a melhor prévia encontrada; isso não prova inviabilidade. É possível aplicar os ajustes seguros e buscar novamente.",
  limite_tentativas:
    "A busca atingiu seu limite de alternativas. Outros arranjos podem existir; o resultado não é uma prova de inviabilidade.",
  limite_acoes:
    "A busca atingiu seu limite de ajustes encadeados. Aplique a prévia se adequada e faça uma nova busca.",
};
const funcoes = (d) =>
  d.alocacoesFuncao?.length
    ? d.alocacoesFuncao
        .map(
          (a) =>
            `${a.funcao} (${horarioComDia(a.inicioMin)}–${horarioComDia(a.fimMin)})`,
        )
        .join(" / ") + (d.alocacoesOmitidas ? " / outras atividades" : "")
    : d.funcao || "";
const horario = (d) =>
  ["T", "FE"].includes(d.status)
    ? `${horarioComDia(d.entradaMin)}–${horarioComDia(d.saidaMin)}${d.intervaloInicioMin == null ? " · sem intervalo" : ` · intervalo ${horarioComDia(d.intervaloInicioMin)}–${horarioComDia(d.intervaloFimMin)}`}${funcoes(d) ? ` · ${funcoes(d)}` : ""}`
    : d.status === "F"
      ? "Folga"
      : d.status;

export function renderExplicacaoBusca(plano) {
  const d = plano.diagnosticoBusca;
  if (!d) return "";
  return `<details class="diagnostico-detalhes busca-auditoria" data-busca-detalhes>
    <summary>Entenda a busca: tentativas e impedimentos</summary>
    <div class="busca-auditoria-conteudo">
    <p>Modalidade: ${plano.buscaEncadeada ? "busca de sequências sem teto fixo de profundidade" : plano.buscaAmpliada ? "busca combinada (registro anterior)" : "busca inicial de ajustes"}. Os limites de avaliação não esgotam todas as distribuições possíveis.</p>
    ${plano.buscaEncadeada ? `<p>Tempo de busca: ${(plano.duracaoBuscaMs/1000).toFixed(1)}s de ${Math.round(plano.limiteTempoMs/1000)}s · maior sequência avaliada: ${plano.profundidadeMaxima} operações. ${plano.memoriaLimitada ? "Algumas ramificações foram descartadas para limitar o uso de memória; outras distribuições podem existir." : ""}</p>` : ""}<h4>Por que a busca terminou?</h4><p>${h(ENCERRAMENTO[d.encerramento] || "Busca concluída.")}</p>
    <p>${plano.tentativas} alternativas avaliadas · ${plano.acoes.length} ajustes aceitos na prévia · limite de ${plano.limiteTentativas} avaliações. Nenhuma mudança é aplicada sem confirmação.</p>
    <h4>O que foi avaliado</h4>${d.tipos.length ? `<div class="busca-auditoria-tabela" tabindex="0" role="region" aria-label="Alternativas avaliadas por tipo"><table><thead><tr><th>Estratégia</th><th>Avaliadas</th><th>Aceitas</th><th>Descartadas</th><th>Filtradas antes da avaliação</th></tr></thead><tbody>${d.tipos.map((t) => `<tr><td>${h(t.titulo)}</td><td>${t.avaliadas}</td><td>${t.aceitas}</td><td>${t.descartadas}</td><td>${t.filtradas}</td></tr>`).join("")}</tbody></table></div>` : "<p>As configurações ou disponibilidades impediram a geração de alternativas. Isso é diferente de avaliar uma troca e rejeitá-la.</p>"}
    ${d.motivos.length ? `<h4>Por que as alternativas foram descartadas</h4><p>Uma alternativa recebe o primeiro motivo decisivo encontrado. Os exemplos são uma amostra de até duas tentativas por motivo, avaliadas ao longo da busca; não são recomendações de alteração.</p>${d.motivos.map((m) => `<details class="diagnostico-faixa" data-busca-motivo="${h(m.codigo)}"><summary>${h(m.titulo)} · ${m.total}</summary><p>${h(m.orientacao)}</p>${m.exemplos.map((e) => `<article class="busca-auditoria-exemplo"><b>${h(e.tipo)}</b>${e.profundidade ? ` · sequência de ${e.profundidade} operação(ões)` : ""}${e.alteracoes.map((a) => `<p>${h(a.nome)} · ${h(formatDateBR(dateFromKey(a.depois.data)))}<br>${h(horario(a.antes))} → ${h(horario(a.depois))}</p>`).join("")}<p>${h(e.mensagem || m.orientacao)}</p></article>`).join("")}</details>`).join("")}` : ""}
    ${d.lacunas.length ? `<h4>O que impede avançar nas lacunas restantes</h4><p>Triagem das configurações atuais, separada das tentativas completas. Cada grupo mostra uma data de referência; não é uma simulação de todos os arranjos possíveis.</p>${d.lacunas.map((g) => `<article class="diagnostico-faixa" data-busca-lacuna><h5>${h(g.funcao)} · ${h(horarioComDia(g.inicioMin))}–${h(horarioComDia(g.fimMin))}</h5><p>${h(formatDateBR(dateFromKey(g.data)))} · ${g.ocorrencias} ocorrência(s) desse padrão · faltam ${g.faltantes} pessoa(s) · ${g.habilitados} habilitado(s) no cadastro.</p>${g.bloqueios.map((b) => `<p>${b.codigo === "habilitacao" ? "" : `<b>${b.total} colaborador(es):</b>`} ${h(b.texto)}${b.nomes.filter(Boolean).length ? ` <small>Exemplos: ${h(b.nomes.filter(Boolean).join(", "))}.</small>` : ""}</p>`).join("")}${!g.bloqueios.length ? "<p>Há pessoas habilitadas sem bloqueio inicial identificado. As tentativas e suas verificações acima explicam os descartes; uma busca limitada não esgota todas as combinações.</p>" : ""}${g.limitesContratuais.map((l) => `<details class="busca-auditoria-exemplo"><summary>Limite teórico ao incluir este dia — ${h(l.nome)}</summary><p>${h(l.mensagem)}</p></details>`).join("")}</article>`).join("")}${d.lacunasLimitadas ? "<p>Exibindo até 16 padrões de lacuna; o quadro de cobertura mantém a relação completa.</p>" : ""}` : ""}
    ${d.capacidade ? `<h4>Isso significa que é preciso contratar?</h4><p><b>${h(d.capacidade.titulo)}</b></p><p>${h(d.capacidade.orientacao)}</p>${d.capacidade.provas.map((p) => `<p>${h(p)}</p>`).join("")}${d.capacidade.avisos.map((p) => `<p>${h(p)}</p>`).join("")}` : ""}
    <p>Carga abaixo da referência contratual não é automaticamente falta, desconto ou abono. A busca preserva essa referência; eventual mudança de contrato ou modelo exige análise própria. Jornadas entre quatro e seis horas continuam sujeitas ao intervalo aplicável.</p>
    </div></details>`;
}
