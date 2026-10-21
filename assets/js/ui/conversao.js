import { converterEscala, compararConversao } from "../domain/conversao.js";
import { createCalendarioUI } from "./calendario.js";
import { createDomain } from "../domain/index.js";
import { gerarCsv } from "../export/csv.js";
import { escapeHtml } from "../shared/formatacao.js";
import {
  fmtHoras,
  minToTime,
  formatDateBR,
  dateFromKey,
} from "../domain/datas-horas.js";
import { PRIMEIRA_FASE, VERSAO_REGRAS } from "../domain/ec141.js";

export function createConversaoUI({ state, storage, env, renderEscalaGerada }) {
  const { document } = env;
  const el = (id) => document.getElementById(id);
  function salvar() {
    if (storage.saveState() === false)
      el("conversao-mensagem").textContent =
        "A proposta foi calculada nesta aba, mas não pôde ser salva no navegador. O espaço de armazenamento pode estar cheio. Exporte o CSV antes de sair ou recarregar a página.";
  }
  const titulos = {
    suficiente:
      "O quadro atual é suficiente para cobrir a operação informada nesta proposta 5×2.",
    insuficiente:
      "O quadro atual é insuficiente para a demanda informada, dentro das restrições atuais.",
    ajustes:
      "A proposta precisa de ajustes de horários ou distribuição; ainda não comprova necessidade de contratar.",
    incompativel:
      "A cobertura foi atendida, mas a proposta contém incompatibilidades de jornada ou repouso.",
    nao_avaliada:
      "Ainda não é possível concluir se o quadro atual é suficiente.",
  };
  function renderComparacao() {
    const c = state.conversao;
    if (!c) {
      el("conversao-comparacao").innerHTML = "";
      return;
    }
    const m = c.comparacao;
    const hora = (value) => (value === 1440 ? "24:00" : minToTime(value));
    el("conversao-comparacao").innerHTML = `
      ${c.desatualizada ? '<p role="alert" class="rounded-lg border border-amber-300 bg-amber-50 p-4 mb-4 font-semibold">Dados da escala atual ou destino alterados. Gere uma nova proposta antes de usar esta comparação. Os resultados abaixo são uma referência anterior.</p>' : ""}
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4"><h3 class="font-display font-semibold text-fintria-navy">Comparação e suficiência da equipe</h3>
      <p id="conversao-diagnostico" class="font-semibold mt-2">${c.desatualizada ? "Comparação desatualizada — conclusão suspensa." : titulos[m.status]}</p>
      <p class="text-sm mt-2">${m.status === "nao_avaliada" ? "Ative a Cobertura operacional e cadastre o mínimo de pessoas por função, horário e dia. Sem faixas válidas no período, não há base para afirmar que a equipe atende à empresa." : "A conclusão vale para as faixas, funções, horários, feriados e restrições cadastrados neste período. Não inclui demandas que não foram informadas."}</p>
      <p class="text-sm mt-2">Lacunas no padrão 6×1: <b>${fmtHoras(m.faltantesAntes)} horas-pessoa</b>. Na proposta 5×2: <b>${fmtHoras(m.faltantesDepois)} horas-pessoa</b>. ${m.erros} incompatibilidade(s) e ${m.pendencias} alerta(s)/pendência(s) de validação. Cobertura completa não equivale a aprovação de todas as condições.</p>
      ${m.faltantesDepois > 0 ? '<p class="text-sm mt-2">Revise os dias permitidos para folga, turnos e horários disponíveis. Quando a capacidade por função for menor que a demanda, será necessário ampliar a equipe dessa função ou rever a operação. O pico de faltantes indica pessoas ausentes ao mesmo tempo, não o total exato de contratações.</p>' : ""}
      ${m.pessoas.some((p) => p.deficits) ? '<p class="text-sm mt-2">Há semanas em que os horários disponíveis não comportam o alvo de horas. A proposta mantém os limites diários e as saídas atuais: por exemplo, 42h em cinco dias exige mais de 8h diárias e fundamento coletivo aplicável. Não foi presumida autorização para ampliar a jornada.</p>' : ""}
      ${m.avisos.map((a) => `<p class="text-sm mt-2">${escapeHtml(a)}</p>`).join("")}
      </div>
      <p class="text-xs text-slate-500 mb-3">Origem preservada: ${c.origem.config.mes + 1}/${c.origem.config.ano}. Comparação abaixo: ambos os padrões projetados em ${c.proposta.config.mes + 1}/${c.proposta.config.ano}, para comparar o mesmo período. Ajustes pontuais feitos em datas da escala original permanecem na referência original; não são transpostos automaticamente para outras datas. ${c.proposta.config.modoRegime === "simulacao" ? "SIMULAÇÃO explícita da fase escolhida." : "Vigência automática por data; semanas que atravessam fases recebem conferência específica."}</p>
      <div class="overflow-x-auto mb-4"><table class="w-full text-sm border border-slate-200"><caption class="text-left font-semibold mb-2">Capacidade por função no período</caption><thead><tr>${["Função", "Demanda (h-pessoa)", "Trabalho proposto (h)", "Lacunas (h-pessoa)", "Pico de faltantes", "Explicação"].map((s) => `<th class="text-left p-2 border-b">${s}</th>`).join("")}</tr></thead><tbody>${m.funcoes.map((f) => `<tr><td class="p-2 border-b">${escapeHtml(f.funcao)}</td><td class="p-2 border-b">${fmtHoras(f.necessarias)}</td><td class="p-2 border-b">${fmtHoras(f.disponiveis)}</td><td class="p-2 border-b">${fmtHoras(f.faltantes)}</td><td class="p-2 border-b">${f.pico}</td><td class="p-2 border-b">${escapeHtml(f.insuficiencias.join(" ") || (f.faltantes ? "Persistem lacunas de distribuição ou disponibilidade de horários; não foi comprovada insuficiência do quadro." : "Demanda atendida pela distribuição proposta."))}</td></tr>`).join("")}</tbody></table></div>
      <div class="overflow-x-auto mb-4"><table class="w-full text-sm border border-slate-200"><caption class="text-left font-semibold mb-2">Antes e depois por colaborador — mesmo mês da proposta</caption><thead><tr>${["Colaborador", "Função", "Horas 6×1 → 5×2", "Dias de trabalho", "Dias sem trabalho", "Semanas abaixo do alvo"].map((s) => `<th class="text-left p-2 border-b">${s}</th>`).join("")}</tr></thead><tbody>${m.pessoas.map((p) => `<tr><td class="p-2 border-b">${escapeHtml(p.nome)}</td><td class="p-2 border-b">${escapeHtml(p.funcao)}</td><td class="p-2 border-b">${fmtHoras(p.horasAntes)} → ${fmtHoras(p.horasDepois)}</td><td class="p-2 border-b">${p.diasAntes} → ${p.diasDepois}</td><td class="p-2 border-b">${p.folgasAntes} → ${p.folgasDepois}</td><td class="p-2 border-b">${p.deficits}</td></tr>`).join("")}</tbody></table></div>
      ${
        m.lacunas.length
          ? `<details class="border rounded-lg p-3 mb-4"><summary class="cursor-pointer font-semibold">Horários descobertos (${m.lacunas.length} faixas)</summary><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr>${["Data", "Função", "Horário", "Necessários", "Presentes", "Faltantes"].map((s) => `<th class="text-left p-2">${s}</th>`).join("")}</tr></thead><tbody>${m.lacunas
              .slice(0, 200)
              .map(
                (l) =>
                  `<tr><td class="p-2">${formatDateBR(dateFromKey(l.data))}</td><td class="p-2">${escapeHtml(l.funcao)}</td><td class="p-2">${hora(l.inicioMin)}–${hora(l.fimMin)}</td><td class="p-2">${l.necessarios}</td><td class="p-2">${l.presentes}</td><td class="p-2">${l.faltantes}</td></tr>`,
              )
              .join(
                "",
              )}</tbody></table></div>${m.lacunas.length > 200 ? "<p>Exibindo as primeiras 200 faixas; todas entram nos totais.</p>" : ""}</details>`
          : ""
      }
      <p class="text-xs text-slate-500 mb-4">A distribuição busca reduzir lacunas preservando funções, entradas, grupos de turno, janelas de horário, contratos e restrições de folga. A busca é limitada; não garante encontrar toda solução possível.</p>`;
    el("btn-exportar-proposta").disabled = !!c.desatualizada;
  }
  function renderConversao() {
    const c = state.conversao;
    el("conversao-resultados").hidden = !c;
    if (!c) return;
    if (c.versaoRegras !== VERSAO_REGRAS) c.desatualizada = true;
    renderComparacao();
    const config = c.proposta.config;
    const calendario = createCalendarioUI({
      state: config,
      domain: createDomain(config),
      env,
      containerId: "resultado-proposta",
      renderRelatorioCobertura: () => "",
      storage: {
        saveState() {
          c.comparacao = compararConversao(c);
          c.editada = true;
          renderComparacao();
          salvar();
        },
      },
    });
    calendario.renderEscalaGerada();
  }
  function initConversao() {
    const atual = `${state.ano}-${String(state.mes + 1).padStart(2, "0")}`;
    el("conversao-periodo").value =
      state.destinoConversao?.periodo ||
      (atual < PRIMEIRA_FASE.slice(0, 7) ? PRIMEIRA_FASE.slice(0, 7) : atual);
    el("conversao-fase").value = state.destinoConversao?.fase || "automatico";
    el("conversao-folgas").value =
      state.destinoConversao?.folgas || "distribuir";
    renderConversao();
  }
  function marcarDesatualizada() {
    if (!state.conversao) return;
    state.conversao.desatualizada = true;
    renderComparacao();
  }
  return {
    initConversao,
    renderConversao,
    marcarDesatualizada,
    bindEvents() {
      for (const campo of ["periodo", "fase", "folgas"])
        el(`conversao-${campo}`).onchange = () => {
          state.destinoConversao = {
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
          };
          marcarDesatualizada();
          salvar();
        };
      el("btn-converter").onclick = () => {
        el("conversao-mensagem").textContent = "";
        try {
          const opcoes = {
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
          };
          state.conversao = converterEscala(state, opcoes);
          state.destinoConversao = opcoes;
          state.escalaGerada = structuredClone(state.conversao.origem.escala);
          renderEscalaGerada();
          renderConversao();
          salvar();
          el("conversao-comparacao").scrollIntoView({
            behavior: "instant",
            block: "start",
          });
        } catch (error) {
          el("conversao-mensagem").textContent = error.message;
        }
      };
      el("btn-exportar-proposta").onclick = () => {
        if (!state.conversao || state.conversao.desatualizada) return;
        const csv = gerarCsv(state.conversao.proposta.config);
        const url = env.URL.createObjectURL(
          new env.Blob([csv], { type: "text/csv;charset=utf-8;" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `proposta-5x2-${state.destinoConversao.periodo}.csv`;
        link.click();
        env.setTimeout(() => env.URL.revokeObjectURL(url), 1000);
      };
    },
  };
}
