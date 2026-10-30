import { permiteSimular42 } from "../domain/simulacao42.js";
import { executarCalculoEscala } from "./calculo-escala.js";
import { renderResumoConversao, renderDetalhesConversao } from "./comparacao-painel.js";
import { converterEscala, compararConversao } from "../domain/conversao.js";
import { createCalendarioUI } from "./calendario.js";
import { createDomain } from "../domain/index.js";
import { PRIMEIRA_FASE, VERSAO_REGRAS } from "../domain/ec141.js";
import { escalaFixa } from "../domain/modelo-escala.js";

export function createConversaoUI({
  state,
  storage,
  env,
  renderEscalaGerada,
  validarPreenchimento = () => true,
}) {
  const { document } = env;
  const el = (id) => document.getElementById(id);
  function salvar() {
    if (storage.saveState() === false)
      el("conversao-mensagem").textContent =
        "A proposta foi calculada, mas a cópia automática neste navegador falhou. Isso não confirma nem impede o salvamento no servidor. Use Salvar preenchimento para guardar a escala atual e a proposta na empresa e aguarde a confirmação. Se estiver usando somente dados locais, exporte os PDFs antes de sair.";
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
  function atualizarOpcao42() {
    const select=el("conversao-fase");
    const option=select.querySelector?.('[value="transicao42"]');
    if(!option)return;
    option.disabled=!permiteSimular42(state,el("conversao-periodo").value);
    option.textContent=option.disabled?"42h — exige ACT/CCT vigente com compensação diária":"Simular fase de 42h";
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
    atualizarOpcao42();
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
      env.window?.addEventListener?.("cjs-remote-saved", (event) => {
        if (event.detail?.current && el("conversao-mensagem").textContent.includes("cópia automática"))
          el("conversao-mensagem").textContent = "Escala atual e proposta salvas no servidor junto com o preenchimento.";
      });
      for (const campo of ["periodo", "fase", "folgas"])
        el(`conversao-${campo}`).onchange = () => {
          atualizarOpcao42();
          state.destinoConversao = {
            modeloEscala: state.modeloEscala || "dinamica",
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
          };
          marcarDesatualizada();
          salvar();
        };
      el("btn-converter").onclick = async () => {
        el("conversao-mensagem").textContent = "";
        atualizarOpcao42();
        if (!validarPreenchimento()) return;
        try {
          const opcoes = {
            modeloEscala: state.modeloEscala || "dinamica",
            periodo: el("conversao-periodo").value,
            fase: el("conversao-fase").value,
            folgas: el("conversao-folgas").value,
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
