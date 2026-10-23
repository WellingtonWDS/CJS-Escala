import {
  resumirEdicaoManual,
  aplicarReadequacaoManual,
  desfazerUltimaEdicaoManual,
} from "../domain/edicao-manual.js";
import { assinaturaAjustes } from "../domain/ajustes-cobertura.js";
import { escapeHtml as h } from "../shared/formatacao.js";
import {
  fmtHoras,
  horarioComDia,
  formatDateBR,
  dateFromKey,
} from "../domain/datas-horas.js";
const data = (d) => formatDateBR(dateFromKey(d));
const descricao = (d) =>
  ["T", "FE"].includes(d.status)
    ? `${d.status} · ${horarioComDia(d.entradaMin)}–${horarioComDia(d.saidaMin)} · ${fmtHoras(d.horas)}${d.intervaloMin ? ` · intervalo ${horarioComDia(d.intervaloInicioMin)}–${horarioComDia(d.intervaloFimMin)}` : ""}`
    : d.status;
export function createEdicaoManualUI({
  state,
  storage,
  env,
  containerId,
  renderEscalaGerada,
  onEscalaChange,
  permitido,
}) {
  const id = `${containerId}-edicao-manual`;
  let worker = null,
    plano = null;
  const raiz = () => env.document.getElementById(id),
    campo = (k) => raiz()?.querySelector(`[data-manual-${k}]`);
  const mensagem = (t) => {
    if (campo("mensagem")) campo("mensagem").textContent = t;
  };
  function parar() {
    worker?.terminate();
    worker = null;
  }
  function checar() {
    if (!permitido())
      throw new Error(
        "A proposta está desatualizada. Gere novamente antes de editar.",
      );
  }
  function salvar(nova) {
    state.escalaGerada = nova;
    onEscalaChange();
    const salvo = storage.saveState();
    renderEscalaGerada();
    if (salvo === false)
      env.alert(
        "Alteração aplicada, mas não foi possível salvar no navegador. Exporte antes de sair.",
      );
  }
  function renderPainel() {
    parar();
    plano = null;
    if (!state.escalaGerada?.ultimaEdicaoManual) return "";
    let r;
    try {
      r = resumirEdicaoManual(state);
    } catch {
      return "";
    }
    return `<section id="${id}" class="border border-slate-300 rounded-lg p-4 mb-4 bg-slate-50" tabindex="-1" style="scroll-margin-top: 100px" aria-label="Revisão da edição manual"><h3 class="font-display font-semibold text-fintria-navy">Revisão da edição manual</h3><p class="text-sm mt-2">${h(r.nome)} · ${data(r.data)}: ${h(descricao(r.antes))} → ${h(descricao(r.depois))}. Semana iniciada em ${data(r.semana)}: <b>${r.repousos} repouso(s)</b>, referência ${r.exigidos}; ${fmtHoras(r.horas)} computadas / alvo ${fmtHoras(r.alvo)}.</p>${r.avisos.length ? `<div role="alert" class="mt-3 p-3 border border-amber-300 bg-amber-50 rounded-md text-sm">${r.avisos.map((a) => `<p>${h(a)}</p>`).join("")}</div>` : ""}<p class="text-sm text-slate-600 mt-2">O dia editado já está na grade. Confira a readequação antes de aplicar outras mudanças. A busca preserva esse dia e as demais edições manuais; pode sugerir trocas na mesma semana entre colegas habilitados.</p><div class="flex flex-wrap gap-2 mt-3"><button type="button" data-manual-buscar class="px-3 py-2 rounded-md bg-fintria-navy text-white text-sm">Buscar readequação</button><button type="button" data-manual-cancelar hidden class="px-3 py-2 border border-slate-300 rounded-md text-sm">Cancelar busca</button><button type="button" data-manual-desfazer class="px-3 py-2 border border-slate-300 rounded-md text-sm">Desfazer última edição</button></div><p data-manual-mensagem role="status" aria-live="polite" class="text-sm mt-3"></p><div data-manual-previa></div></section>`;
  }
  function mostrar() {
    mensagem(
      plano.semAjustesNecessarios
        ? "A edição não exige troca adicional nas verificações realizadas. Confira as análises da escala."
        : plano.alternativas.length
          ? "Selecione uma alternativa e confira todos os dias alterados. As sugestões abaixo ainda não foram aplicadas."
          : "A edição permanece como rascunho; não foram aplicadas mudanças adicionais.",
    );
    campo("previa").innerHTML =
      plano.avisos.map((a) => `<p class="text-sm mt-2">${h(a)}</p>`).join("") +
      (plano.alternativas.length
        ? `<label class="block text-sm font-semibold mt-3">Alternativa<select data-manual-opcao class="w-full mt-1 border border-slate-300 rounded-md px-3 py-2 bg-white text-sm">${plano.alternativas.map((o, i) => `<option value="${i}">${o.diaFolga ? `Folga em ${data(o.diaFolga)}` : "Ajuste de cobertura"} · ${o.adicionais} colega(s) · ${fmtHoras(o.horas)} / ${fmtHoras(o.alvo)}</option>`).join("")}</select></label><div data-manual-detalhes></div><button type="button" data-manual-aplicar class="mt-3 px-4 py-2 rounded-md bg-fintria-verde text-white font-semibold text-sm">Aplicar readequação</button>`
        : "");
    function detalhes() {
      const o = plano.alternativas[Number(campo("opcao").value)];
      campo("detalhes").innerHTML =
        `<p class="text-sm mt-2">${o.coberturaAvaliada ? (o.coberturaCompleta ? "Cobertura operacional atendida." : "A proposta não cria novas lacunas; há lacunas anteriores que continuam exigindo revisão.") : "Cobertura operacional não avaliada."}</p><div class="overflow-x-auto max-h-96 mt-2"><table class="w-full text-xs"><caption class="text-left font-semibold">Mudanças propostas, além do dia já editado</caption><thead><tr><th>Colaborador</th><th>Data</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${o.alteracoes.map((a) => `<tr>${[state.escalaGerada.resultado.find((r) => r.colaborador.id === a.colaboradorId)?.colaborador.nome, data(a.data), descricao(a.antes), descricao(a.depois)].map((t) => `<td class="p-2 border-b">${h(t)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    if (plano.alternativas.length) {
      detalhes();
      campo("opcao").addEventListener("change", detalhes);
      campo("aplicar").addEventListener("click", () => {
        try {
          checar();
          salvar(
            aplicarReadequacaoManual(
              state,
              plano,
              Number(campo("opcao").value),
            ),
          );
        } catch (e) {
          mensagem(e.message);
        }
      });
    }
  }
  function buscar() {
    try {
      checar();
      parar();
      plano = null;
      campo("previa").innerHTML = "";
      if (typeof env.window.Worker !== "function")
        throw new Error(
          "A busca automática requer um navegador atualizado. Revise os avisos e ajuste os dias manualmente.",
        );
      worker = new env.window.Worker(
        new URL("../workers/edicao-manual.js", import.meta.url),
        { type: "module" },
      );
      const atual = worker,
        elemento = raiz(),
        assinatura = assinaturaAjustes(state);
      campo("buscar").disabled = true;
      campo("cancelar").hidden = false;
      elemento.setAttribute("aria-busy", "true");
      mensagem("Calculando trocas de folga e impacto na cobertura…");
      const terminar = () => {
        parar();
        campo("buscar").disabled = false;
        campo("cancelar").hidden = true;
        elemento.removeAttribute("aria-busy");
      };
      worker.onmessage = (event) => {
        if (worker !== atual) return;
        if (raiz() !== elemento) {
          parar();
          return;
        }
        if (event.data.progresso) {
          mensagem(
            `Calculando alternativas: ${event.data.progresso.avaliadas} de ${event.data.progresso.total}…`,
          );
          return;
        }
        terminar();
        try {
          checar();
          if (assinatura !== assinaturaAjustes(state))
            throw new Error("Os dados mudaram. Busque novamente.");
          if (event.data.erro) throw new Error(event.data.erro);
          plano = event.data.plano;
          mostrar();
        } catch (e) {
          mensagem(e.message);
        }
      };
      worker.onerror = () => {
        if (worker !== atual) return;
        if (raiz() !== elemento) {
          parar();
          return;
        }
        terminar();
        mensagem(
          "Não foi possível concluir a busca. Tente novamente; a edição permanece como rascunho.",
        );
      };
      worker.postMessage({
        config: structuredClone(
          Object.fromEntries(
            Object.entries(state).filter(([k]) => k !== "conversao"),
          ),
        ),
      });
    } catch (e) {
      parar();
      mensagem(e.message);
    }
  }
  function bindEvents() {
    if (!campo("buscar")) return;
    campo("buscar").addEventListener("click", buscar);
    campo("cancelar").addEventListener("click", () => {
      parar();
      campo("buscar").disabled = false;
      campo("cancelar").hidden = true;
      raiz().removeAttribute("aria-busy");
      mensagem(
        "Busca cancelada. Apenas a edição manual permanece; confira os avisos antes de usar a escala.",
      );
    });
    campo("desfazer").addEventListener("click", () => {
      try {
        checar();
        parar();
        salvar(desfazerUltimaEdicaoManual(state));
      } catch (e) {
        mensagem(e.message);
      }
    });
    buscar();
  }
  return { renderPainel, bindEvents, destacar: () => raiz()?.focus() };
}
