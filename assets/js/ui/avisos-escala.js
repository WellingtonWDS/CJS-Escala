import { escapeHtml as h } from "../shared/formatacao.js";

const severidades = {
  erro: { nome: "Correção necessária", acao: "Corrija esta condição antes de utilizar a escala." },
  alerta: { nome: "Requer análise", acao: "Confira as condições de jornada e o instrumento coletivo aplicável." },
  pendencia: { nome: "Conferência pendente", acao: "Complete ou confira a documentação indicada." },
  info: { nome: "Informação", acao: "Considere esta orientação ao revisar o resultado." },
};

/** Agrupa mensagens repetidas sem perder datas, pessoas ou o texto original. */
export function agruparAvisos(validacoes, incluir = () => true) {
  const grupos = new Map();
  for (const { r, colaborador = r?.colaborador, issues = [] } of validacoes) {
    for (const i of issues.filter(incluir)) {
      const mensagem = String(i.mensagem || "");
      const chave = JSON.stringify([i.severidade, i.tipo, mensagem.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "{data}")]);
      if (!grupos.has(chave)) grupos.set(chave, { ...i, mensagem, ocorrencias: [], pessoas: new Set() });
      const grupo = grupos.get(chave);
      const nome = colaborador?.nome || i.nome || "Colaborador sem nome";
      grupo.pessoas.add(colaborador?.id || nome);
      grupo.ocorrencias.push({ nome, mensagem });
    }
  }
  return [...grupos.values()].map((g) => ({ ...g, pessoas: g.pessoas.size }));
}

export function renderAvisosEscala(validacoes, { erros = false, transformar = (s) => s } = {}) {
  const grupos = agruparAvisos(validacoes, (i) => erros ? i.severidade === "erro" : i.severidade !== "erro");
  const total = grupos.reduce((s, g) => s + g.ocorrencias.length, 0);
  if (!grupos.length && erros) return "";
  const titulo = erros ? `${total} incompatibilidade(s) objetiva(s) — ${grupos.length} condição(ões) para corrigir` : `Conferências e orientações — ${total} ocorrência(s)`;
  return `<details ${erros ? 'data-erros-escala open' : 'data-analises-escala'} class="avisos-escala" data-severidade="${erros ? "erro" : "analise"}">
    <summary><span class="avisos-escala-titulo">${h(titulo)}</span><span class="avisos-escala-subtitulo">${erros ? "Corrija antes de utilizar a escala. Consulte abaixo quem é afetado e as ocorrências." : "Veja os pontos de atenção agrupados por assunto, com o detalhe de cada colaborador."}</span></summary>
    <div class="avisos-escala-grupos">${grupos.map((g) => {
      const nivel = severidades[g.severidade] || severidades.info;
      return `<article class="aviso-escala" data-aviso-tipo="${h(g.tipo || "informacao")}" data-severidade="${h(g.severidade)}"><div class="aviso-escala-cabecalho"><span>${nivel.nome}</span><span>${g.pessoas} colaborador(es) · ${g.ocorrencias.length} ocorrência(s)</span></div><p class="aviso-escala-resumo">${h(transformar(g.mensagem))}</p><p class="aviso-escala-acao">${nivel.acao}</p><details><summary>Ver colaboradores e todas as ocorrências</summary><ul>${g.ocorrencias.map((o) => `<li><strong>${h(o.nome)}</strong><span>${h(transformar(o.mensagem))}</span></li>`).join("")}</ul></details></article>`;
    }).join("") || '<p class="aviso-escala-vazio">Nenhuma conferência adicional nas regras modeladas.</p>'}</div>
    <p class="avisos-escala-nota">A verificação considera as regras modeladas e os dados informados. A ausência de erros não substitui a conferência do caso concreto.</p>
  </details>`;
}
