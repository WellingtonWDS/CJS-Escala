import { DIAS_SEMANA } from "../config/regras-jornada.js";
import {
  dateFromKey,
  formatDateBR,
  minToTime,
  fmtHoras,
} from "../domain/datas-horas.js";
import { validarDemanda } from "../domain/cobertura.js";
import { escapeHtml } from "../shared/formatacao.js";
const hora = (m) => (m === 1440 ? "24:00" : minToTime(m));

export function createCoberturaUI({
  state,
  domain,
  storage,
  env,
  invalidarEscala,
}) {
  const { document } = env;
  let editando = null;
  let inicializado = false;
  const campo = (nome) => document.getElementById(`cobertura-${nome}`);
  const mensagem = (texto) => {
    campo("mensagem").textContent = texto;
  };
  function renderFuncoesCobertura() {
    const nomes = new Set(
      [
        ...state.colaboradores.map((c) => c.cargo),
        ...state.demandasCobertura.map((d) => d.funcao),
      ].filter(Boolean),
    );
    document.getElementById("funcoes-cobertura").innerHTML = [...nomes]
      .map((n) => `<option value="${escapeHtml(n)}"></option>`)
      .join("");
  }
  function preencher(demanda = null) {
    editando = demanda?.id ?? null;
    campo("funcao").value = demanda?.funcao ?? "";
    campo("inicio").value = demanda?.inicio ?? "09:00";
    campo("fim").value = demanda?.fim ?? "18:00";
    campo("minimo").value = demanda?.minimo ?? 1;
    campo("feriados").checked = demanda?.incluirFeriados ?? false;
    campo("dias").innerHTML = DIAS_SEMANA.map(
      (nome, dia) =>
        `<label class="inline-flex items-center gap-1 mr-3 mb-2"><input type="checkbox" value="${dia}" ${(demanda?.diasSemana ?? state.diasTrabalho).includes(dia) ? "checked" : ""}>${nome}</label>`,
    ).join("");
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
    campo("lista").innerHTML = state.demandasCobertura.length
      ? state.demandasCobertura
          .map(
            (
              d,
            ) => `<div class="border border-slate-200 rounded-lg p-3 mb-2 flex justify-between gap-3 items-center flex-wrap">
      <div><b>${escapeHtml(d.funcao)}</b> · ${escapeHtml(d.inicio)}–${escapeHtml(d.fim)}${d.fim < d.inicio ? " (termina no dia seguinte)" : ""} · mínimo ${d.minimo}<div class="text-xs text-slate-500">${d.diasSemana.map((n) => DIAS_SEMANA[n]).join(", ")} · ${d.incluirFeriados ? "Inclui feriados" : "Exceto feriados"}</div></div>
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
    return `<section id="relatorio-cobertura" class="border rounded-lg p-4 mb-4">${titulo}${avisos}${conteudo}<p class="text-xs text-slate-500 mt-2">Presentes = pessoas da função trabalhando no período, sem contar intervalos, folgas ou funções diferentes. Horas-pessoa somam a duração de cada falta multiplicada pela quantidade necessária.</p></section>`;
  }
  function bindEvents() {
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
        diasSemana: [...campo("dias").querySelectorAll("input:checked")].map(
          (el) => Number(el.value),
        ),
        incluirFeriados: campo("feriados").checked,
      };
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
