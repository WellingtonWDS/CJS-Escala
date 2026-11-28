import { diagnosticoSimulacao42 } from "../domain/simulacao42.js";
import { executarCalculoEscala } from "./calculo-escala.js";
import { renderResumoConversao, renderDetalhesConversao } from "./comparacao-painel.js";
import { converterEscala, compararConversao } from "../domain/conversao.js";
import { createCalendarioUI } from "./calendario.js";
import { createDomain } from "../domain/index.js";
import { PRIMEIRA_FASE, VERSAO_REGRAS } from "../domain/ec141.js";
import { escalaFixa } from "../domain/modelo-escala.js";
import { initConversaoLayout } from "./conversao-layout.js";
import { motivoSemQuinzenal } from "../domain/revezamento-quinzenal.js";
import { motivoSemConsecutiva } from "../domain/folga-consecutiva.js";

export function createConversaoUI({
  state,
  storage,
  env,
  renderEscalaGerada,
  validarPreenchimento = () => true,
}) {
  const { document } = env;
  const el = (id) => document.getElementById(id);
  // A cópia no navegador é só uma reserva. Com empresa do servidor aberta, o que vale é
  // "Salvar preenchimento", e a falta de espaço local não precisa de aviso aqui.
  function salvar() {
    if (storage.saveState() === false && !env.empresaServidor?.())
      el("conversao-mensagem").textContent =
        "A proposta foi calculada, mas não coube no espaço deste navegador. Exporte os PDFs antes de sair.";
  }
  function renderComparacao() {
    const c = state.conversao;
    el("conversao-comparacao").innerHTML = c ? renderDetalhesConversao(c) : "";
    const resumo = el("conversao-visao-geral");
    if (resumo) resumo.innerHTML = c ? renderResumoConversao(c) : "";
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
      ajustesPermitidos: () => !c.desatualizada,
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
  // Explica a opção de folgas escolhida e bloqueia o revezamento quinzenal quando não se aplica.
  function atualizarFolgas() {
    const select = el("conversao-folgas"), ajuda = el("conversao-folgas-ajuda");
    const opcao = select?.querySelector?.('[value="quinzenal"]');
    if (!select || !opcao) return;
    const motivo = motivoSemQuinzenal(state);
    opcao.disabled = !!motivo;
    opcao.title = motivo;
    if (motivo && select.value === "quinzenal") {
      select.value = "distribuir";
      if (state.destinoConversao) state.destinoConversao.folgas = "distribuir";
    }
    if (ajuda) ajuda.textContent = {
      distribuir: "Cada colaborador recebe o segundo repouso no dia que melhor ajuda a cobertura, repetido todas as semanas.",
      quinzenal: "Semanas alternadas: em uma, de segunda a sexta; na outra, trabalha no sábado e folga em um dia útil. A equipe é dividida para cobrir todos os sábados. A semana com sábado reduzido fica abaixo do alvo sem reduzir salário.",
      fim_semana: "Todos folgam aos sábados e domingos.",
    }[select.value] + (motivo ? ` Revezamento quinzenal indisponível: ${motivo}` : "");
    // Folga consecutiva periódica: não se aplica a sábado e domingo fixos (já consecutivos).
    const consecutiva = el("conversao-consecutiva"), ajudaC = el("conversao-consecutiva-ajuda");
    if (consecutiva) {
      const motivoC = select.value === "fim_semana" ? "Com sábado e domingo fixos, as folgas já são consecutivas." : motivoSemConsecutiva(state);
      consecutiva.disabled = !!motivoC;
      if (motivoC) consecutiva.value = "0";
      if (ajudaC) ajudaC.textContent = motivoC || (consecutiva.value === "0"
        ? "A segunda folga fica no dia que melhor ajuda a cobertura, colada ou não ao domingo."
        : `Domingo como folga fixa: a cada ${consecutiva.value} meses, cada colaborador tem a segunda folga no sábado ou na segunda. Neste mês, ${consecutiva.value === "2" ? "metade" : "um terço"} de cada função; no mês seguinte, outro grupo.`);
    }
  }
  function atualizarOpcao42() {
    atualizarFolgas();
    const select=el("conversao-fase");
    const option=select.querySelector?.('[value="transicao42"]');
    if(!option)return;
    const regra = diagnosticoSimulacao42(state,el("conversao-periodo").value);
    option.disabled=!regra.permitida;
    const orientacao = el("conversao-regra42");
    if (orientacao) {
      if (orientacao.textContent !== regra.mensagem) orientacao.textContent = regra.mensagem;
      orientacao.dataset.motivo = regra.motivo;
    }
    // Antes da liminar: option.textContent=option.disabled?"42h — exige ACT/CCT vigente com compensação diária":"Simular fase de 42h";
    option.textContent=regra.rotulo;
    if(option.disabled && select.value==="transicao42") {
      select.value="definitivo40";
      if(state.destinoConversao)state.destinoConversao.fase="definitivo40";
      if(state.conversao)state.conversao.desatualizada=true;
    }
  }
  function initConversao() {
    const atual = `${state.ano}-${String(state.mes + 1).padStart(2, "0")}`;
    el("conversao-periodo").value =
      state.destinoConversao?.periodo ||
      (atual < PRIMEIRA_FASE.slice(0, 7) ? PRIMEIRA_FASE.slice(0, 7) : atual);
    el("conversao-fase").value = escalaFixa(state) && state.destinoConversao?.modeloEscala !== "fixa"
      ? "definitivo40" : state.destinoConversao?.fase || "automatico";
    el("conversao-folgas").value =
      state.destinoConversao?.folgas || "distribuir";
    if (el("conversao-consecutiva")) el("conversao-consecutiva").value = String(state.destinoConversao?.consecutiva || 0);
    atualizarOpcao42();
    const c = state.conversao;
    if (c && !c.desatualizada && c.versaoRegras === VERSAO_REGRAS) c.comparacao = compararConversao(c);
    renderConversao();
  }
  function marcarDesatualizada() {
    atualizarOpcao42();
    if (!state.conversao) return;
    state.conversao.desatualizada = true;
    renderComparacao();
  }
  return {
    initConversao,
    renderConversao,
    marcarDesatualizada,
    bindEvents() {
      initConversaoLayout(document);
      // Incluir/remover pessoas a contratar e gerar a proposta de novo.
      document.getElementById("conversao-visao-geral")?.addEventListener?.("click", (e) => {
        const incluir = e.target.closest?.("[data-conv-contratar]"), remover = e.target.closest?.("[data-conv-sem-contratacao]");
        if (!incluir && !remover) return;
        const atuais = state.destinoConversao?.contratacoes || [];
        const novas = remover ? [] : [...atuais, ...(state.conversao?.comparacao?.contratacaoSugerida || [])
          .flatMap((x) => Array.from({ length: x.quantidade }, () => ({ funcao: x.funcao, horasSemana: x.horasSemana })))];
        state.destinoConversao = { ...(state.destinoConversao || {}), contratacoes: novas };
        el("btn-converter").click();
      });
      for (const campo of ["periodo", "fase", "folgas", "consecutiva"])
        el(`conversao-${campo}`).onchange = () => {
          atualizarOpcao42();
          state.destinoConversao = {
            modeloEscala: state.modeloEscala || "dinamica",
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
            consecutiva: Number(el("conversao-consecutiva")?.value || 0),
            contratacoes: state.destinoConversao?.contratacoes || [],
          };
          marcarDesatualizada();
          salvar();
        };
      el("btn-converter").onclick = async () => {
        el("conversao-mensagem").textContent = "";
        atualizarOpcao42();
        if (!validarPreenchimento()) return;
        if (env.planGate && !(await env.planGate("proposta"))) return;
        try {
          const opcoes = {
            modeloEscala: state.modeloEscala || "dinamica",
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
            consecutiva: Number(el("conversao-consecutiva")?.value || 0),
            contratacoes: state.destinoConversao?.contratacoes || [],
          };
          await executarCalculoEscala({ state, env, botao: el("btn-converter"), operacao: "converter", opcoes,
            fallback: () => converterEscala(state, opcoes),
            aplicar: (resultado) => {
              state.conversao = resultado;
              state.destinoConversao = opcoes;
              state.escalaGerada = structuredClone(state.conversao.origem.escala);
              renderEscalaGerada();
              renderConversao();
              salvar();
              el("conversao-resultados").scrollIntoView({
                behavior: "instant",
                block: "start",
              });
            },
          });
        } catch (error) {
          el("conversao-mensagem").textContent = error.message;
        }
      };

    },
  };
}
