import { diagnosticarEquipe } from "../domain/diagnostico-equipe.js";
import { renderDiagnosticoEquipe } from "./diagnostico-equipe.js";
import { funcoesHabilitadas } from "../domain/funcoes.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import {
  dateFromKey,
  formatDateBR,
  minToTime,
  fmtHoras,
} from "../domain/datas-horas.js";
import { validarDemanda, normalizarFuncao } from "../domain/cobertura.js";
import { escapeHtml } from "../shared/formatacao.js";
const hora = (m) => (m === 1440 ? "24:00" : minToTime(m));

export function createCoberturaUI({
  state,
  domain,
  storage,
  env,
  invalidarEscala,
  onCoberturaChange,
}) {
  const { document } = env;
  let editando = null;
  let inicializado = false;
  let diasSelecionados = [];
  const campo = (nome) => document.getElementById(`cobertura-${nome}`);
  const mensagem = (texto) => {
    campo("mensagem").textContent = texto;
  };
  function funcoesCadastradas() {
    const funcoes = new Map();
    for (const pessoa of state.colaboradores) {
      for (const nome of funcoesHabilitadas(pessoa))
        if (!funcoes.has(normalizarFuncao(nome)))
          funcoes.set(normalizarFuncao(nome), nome);
    }
    return [...funcoes.values()];
  }
  function renderFuncoesCobertura() {
    const select = campo("funcao");
    const anterior = select.value;
    const funcoes = funcoesCadastradas();
    select.innerHTML =
      '<option value="">Selecione uma função</option>' +
      funcoes
        .map(
          (n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`,
        )
        .join("");
    select.value =
      funcoes.find((n) => normalizarFuncao(n) === normalizarFuncao(anterior)) ??
      "";
    select.disabled = funcoes.length === 0;
    campo("salvar").disabled = funcoes.length === 0;
    campo("funcoes-aviso").textContent = funcoes.length
      ? ""
      : "Preencha o Cargo / função de pelo menos um colaborador para cadastrar a cobertura.";
  }
  function renderDiasCobertura() {
    campo("dias").innerHTML = DIAS_SEMANA.map(
      (nome, dia) =>
        `<button type="button" data-cobertura-dia="${dia}" aria-label="${nome}" aria-pressed="${diasSelecionados.includes(dia)}" class="w-11 py-2 text-center border-[1.5px] rounded-md font-semibold text-xs ${diasSelecionados.includes(dia) ? "bg-fintria-verde border-fintria-verde text-white" : "border-slate-200 bg-white text-slate-500"}">${nome}</button>`,
    ).join("");
    campo("dias")
      .querySelectorAll("button")
      .forEach((btn) => {
        btn.onclick = () => {
          const dia = Number(btn.dataset.coberturaDia);
          diasSelecionados = diasSelecionados.includes(dia)
            ? diasSelecionados.filter((d) => d !== dia)
            : [...diasSelecionados, dia].sort((a, b) => a - b);
          renderDiasCobertura();
        };
      });
  }
  function renderCoberturaAtiva() {
    document.getElementById("tg-cobertura").checked = state.coberturaAtiva;
    campo("conteudo").hidden = !state.coberturaAtiva;
  }
  function preencher(demanda = null) {
    editando = demanda?.id ?? null;
    renderFuncoesCobertura();
    campo("funcao").value =
      funcoesCadastradas().find(
        (n) => normalizarFuncao(n) === normalizarFuncao(demanda?.funcao),
      ) ?? "";
    campo("inicio").value = demanda?.inicio ?? "09:00";
    campo("fim").value = demanda?.fim ?? "18:00";
    campo("minimo").value = demanda?.minimo ?? 1;
    campo("feriados").checked = demanda?.incluirFeriados ?? false;
    diasSelecionados = [...(demanda?.diasSemana ?? state.diasTrabalho)];
    renderDiasCobertura();
    campo("salvar").textContent =
      editando === null ? "+ Adicionar faixa" : "Salvar alteração";
    campo("cancelar").hidden = editando === null;
    mensagem("");
  }
  function renderCoberturaConfig() {
    if (!inicializado) {
      preencher();
      inicializado = true;
    }
    renderFuncoesCobertura();
    renderCoberturaAtiva();
    campo("lista").innerHTML = state.demandasCobertura.length
      ? state.demandasCobertura
          .map(
            (
              d,
            ) => `<div class="border border-slate-200 rounded-lg p-3 mb-2 flex justify-between gap-3 items-center flex-wrap">
      <div><b>${escapeHtml(d.funcao)}</b> · ${escapeHtml(d.inicio)}–${escapeHtml(d.fim)}${d.fim < d.inicio ? " (termina no dia seguinte)" : ""} · mínimo ${d.minimo}<div class="text-xs text-slate-500">${d.diasSemana.map((n) => DIAS_SEMANA[n]).join(", ")}${state.modeloEscala === "fixa" ? " · Toda semana" : ` · ${d.incluirFeriados ? "Inclui feriados" : "Exceto feriados"}`}</div></div>
      <div><button type="button" class="border rounded px-2 py-1 mr-2" data-cobertura-editar="${d.id}">Editar</button><button type="button" class="border rounded px-2 py-1 text-fintria-vermelho" data-cobertura-remover="${d.id}">Remover</button></div></div>`,
          )
          .join("")
      : '<p class="text-sm text-slate-500 mb-3">Nenhuma faixa cadastrada. Adicione a equipe mínima necessária para analisar os horários descobertos.</p>';
    campo("lista")
      .querySelectorAll("[data-cobertura-editar]")
      .forEach((btn) => {
        btn.onclick = () =>
          preencher(
            state.demandasCobertura.find(
              (d) => d.id === Number(btn.dataset.coberturaEditar),
            ),
          );
      });
    campo("lista")
      .querySelectorAll("[data-cobertura-remover]")
      .forEach((btn) => {
        btn.onclick = () => {
          const id = Number(btn.dataset.coberturaRemover);
          state.demandasCobertura = state.demandasCobertura.filter(
            (d) => d.id !== id,
          );
          invalidarEscala();
          storage.saveState();
          renderCoberturaConfig();
          if (editando === id) preencher();
        };
      });
  }
  function renderRelatorioCobertura(resultado) {
    if (!state.coberturaAtiva) return "";
    const relatorio = domain.analisarCobertura(resultado);
    const titulo =
      '<h3 class="font-display text-fintria-navy text-base font-semibold mb-2">Cobertura por horário e função</h3>';
    if (!relatorio.configurada)
      return `<section id="relatorio-cobertura" class="border rounded-lg p-4 mb-4">${titulo}<p class="text-sm text-slate-500">Cobertura por função ainda não avaliada: cadastre as faixas em Cobertura operacional.</p></section>`;
    const avisos = relatorio.avisos
      .map((a) => `<p class="text-fintria-ambar text-sm">${escapeHtml(a)}</p>`)
      .join("");
    const dias = new Set(relatorio.lacunas.map((f) => f.data)).size;
    const deficit = relatorio.lacunas.reduce(
      (s, f) => s + (f.fimMin - f.inicioMin) * f.faltantes,
      0,
    );
    let conteudo = relatorio.lacunas.length
      ? `<p class="text-fintria-vermelho font-semibold mb-2">${relatorio.lacunas.length} faixa(s) descoberta(s) em ${dias} dia(s) · ${fmtHoras(deficit / 60)} horas-pessoa faltantes.</p><div class="overflow-x-auto max-h-96"><table class="w-full text-sm border-collapse"><thead><tr>${["Data", "Função", "Horário", "Mínimo", "Presentes", "Faltam"].map((c) => `<th class="text-left border-b p-2">${c}</th>`).join("")}</tr></thead><tbody>${relatorio.lacunas.map((f) => `<tr data-cobertura-lacuna><td class="p-2 border-b whitespace-nowrap">${formatDateBR(dateFromKey(f.data))}</td><td class="p-2 border-b">${escapeHtml(f.funcao)}</td><td class="p-2 border-b whitespace-nowrap">${hora(f.inicioMin)}–${hora(f.fimMin)}</td><td class="p-2 border-b">${f.necessarios}</td><td class="p-2 border-b">${f.presentes}</td><td class="p-2 border-b font-semibold text-fintria-vermelho">${f.faltantes}</td></tr>`).join("")}</tbody></table></div>`
      : relatorio.periodos.length
        ? '<p class="text-fintria-verde">Todas as faixas aplicáveis estão cobertas na escala atual.</p>'
        : '<p class="text-slate-500">Nenhuma faixa válida se aplica ao período selecionado. Confira os dias da semana, o dia inicial e a opção de feriados.</p>';
    return `${renderDiagnosticoEquipe(diagnosticarEquipe(state, resultado, relatorio))}<section id="relatorio-cobertura" class="border rounded-lg p-4 mb-4">${titulo}${avisos}${conteudo}<p class="text-xs text-slate-500 mt-2">Presentes = pessoas alocadas na função para a qual estão habilitadas e trabalhando no período, sem contar intervalos, folgas ou funções diferentes. Horas-pessoa somam a duração de cada falta multiplicada pela quantidade necessária.</p></section>`;
  }
  function bindEvents() {
    document.getElementById("tg-cobertura").onchange = (e) => {
      state.coberturaAtiva = e.target.checked;
      renderCoberturaAtiva();
      onCoberturaChange();
      storage.saveState();
    };
    campo("cancelar").onclick = () => preencher();
    campo("form").onsubmit = (e) => {
      e.preventDefault();
      const demanda = {
        id:
          editando ??
          Math.max(
            1,
            Number(state.proximaDemandaId) || 1,
            ...state.demandasCobertura.map((d) => d.id + 1),
          ),
        funcao: campo("funcao").value.trim(),
        inicio: campo("inicio").value,
        fim: campo("fim").value,
        minimo: Number(campo("minimo").value),
        diasSemana: [...diasSelecionados],
        incluirFeriados: campo("feriados").checked,
      };
      if (!state.coberturaAtiva) return;
      if (!funcoesCadastradas().includes(demanda.funcao)) {
        mensagem(
          "Selecione uma função preenchida no cadastro dos colaboradores.",
        );
        return;
      }
      const erro = validarDemanda(demanda);
      if (erro) {
        mensagem(erro);
        return;
      }
      if (editando === null) {
        state.demandasCobertura.push(demanda);
        state.proximaDemandaId = demanda.id + 1;
      } else
        state.demandasCobertura = state.demandasCobertura.map((d) =>
          d.id === editando ? demanda : d,
        );
      invalidarEscala();
      storage.saveState();
      renderCoberturaConfig();
      preencher();
    };
  }
  return {
    renderCoberturaConfig,
    renderFuncoesCobertura,
    renderRelatorioCobertura,
    bindEvents,
  };
}
