import {
  aplicarAjustesCobertura,
  desfazerAjustesCobertura,
  assinaturaAjustes,
} from "../domain/ajustes-cobertura.js";
import { funcaoDoDia } from "../domain/funcoes.js";
import { escapeHtml } from "../shared/formatacao.js";
import {
  fmtHoras,
  horarioComDia,
  dateFromKey,
  formatDateBR,
} from "../domain/datas-horas.js";

export function createAjustesCoberturaUI({
  state,
  storage,
  env,
  containerId,
  renderEscalaGerada,
  onEscalaChange,
  permitido = () => true,
}) {
  let worker = null,
    plano = null;
  const id = `${containerId}-ajustes`;
  const elemento = () => env.document.getElementById(id);
  const campo = (nome) => elemento()?.querySelector(`[data-ajuste-${nome}]`);
  function parar() {
    worker?.terminate();
    worker = null;
  }
  function terminarBusca() {
    parar();
    if (campo("buscar")) {
      campo("buscar").disabled = false;
      campo("cancelar").hidden = true;
      campo("progresso").hidden = true;
      elemento().removeAttribute("aria-busy");
    }
  }
  async function informarErro(texto, raiz = elemento()) {
    if (elemento() !== raiz) return;
    await env.alert(texto, { title: "Busca de ajustes de cobertura", confirmText: "Entendi" });
    if (elemento() === raiz) mensagem(texto);
  }
  function renderPainel() {
    parar();
    plano = null;
    if (!state.coberturaAtiva) return "";
    const registro = state.escalaGerada?.ajustesCobertura;
    const podeDesfazer =
      registro?.assinaturaDepois === assinaturaAjustes(state);
    return `<section id="${id}" class="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50"><h3 class="font-display font-semibold text-fintria-navy mb-2">Ajustes sugeridos para cobertura</h3><p class="text-sm text-slate-600 mb-3">Busque trocas de folga na mesma semana, ajustes de entrada/saída, redistribuição dos intervalos e realocação para funções habilitadas. Confira horários e intervalos antes de aplicar. A busca mantém horas semanais e dias de trabalho, respeita restrições e descanso e preserva dias editados manualmente. Ao ajustar a proposta 5×2, a escala de origem é preservada.</p><div class="flex flex-wrap gap-2"><button type="button" data-ajuste-buscar class="px-4 py-2 bg-fintria-navy text-white font-semibold rounded-md text-sm">Buscar ajustes de cobertura</button><button type="button" data-ajuste-cancelar hidden class="px-3 py-2 border border-slate-300 rounded-md text-sm">Cancelar busca</button><button type="button" data-ajuste-desfazer ${podeDesfazer ? "" : "disabled"} class="px-3 py-2 border border-slate-300 rounded-md text-sm disabled:opacity-50">Desfazer último ajuste</button></div><div data-ajuste-progresso hidden class="mt-3 rounded-md border border-slate-200 bg-white p-3"><div class="flex items-center gap-2 text-sm"><span class="ajuste-spinner" aria-hidden="true"></span><span data-ajuste-contador>Preparando a busca…</span></div><progress data-ajuste-barra aria-label="Alternativas avaliadas no limite da busca" value="0" max="600" class="w-full mt-2"></progress></div><p data-ajuste-mensagem role="status" aria-live="polite" class="text-sm text-slate-600 mt-3">${registro ? `Último ajuste aplicado: ${fmtHoras((registro.antes.minutosFaltantes - registro.depois.minutosFaltantes) / 60)} horas-pessoa de lacunas reduzidas.${podeDesfazer ? "" : " Houve alterações posteriores; desfazer está indisponível."}` : ""}</p><div data-ajuste-previa></div></section>`;
  }
  function checar() {
    if (!permitido())
      throw new Error(
        "A proposta está desatualizada. Gere novamente antes de buscar ou aplicar ajustes.",
      );
  }
  function mensagem(texto) {
    if (campo("mensagem")) campo("mensagem").textContent = texto;
  }
  function salvar() {
    onEscalaChange();
    const salvo = storage.saveState();
    renderEscalaGerada();
    const foco = campo("desfazer")?.disabled
      ? campo("buscar")
      : campo("desfazer");
    foco?.focus({ preventScroll: true });
    if (salvo === false)
      mensagem(
        "Ajuste aplicado nesta aba, mas não foi possível salvar no navegador. Exporte antes de sair.",
      );
  }
  function descricao(c, d) {
    if (!["T", "FE"].includes(d.status))
      return d.status === "F" ? "Folga" : d.status;
    return `${horarioComDia(d.entradaMin)}–${horarioComDia(d.saidaMin)} · ${funcaoDoDia(c, d)} · ${fmtHoras(d.horas)} de trabalho${d.intervaloMin ? ` · intervalo ${horarioComDia(d.intervaloInicioMin)}–${horarioComDia(d.intervaloFimMin)}` : ""}`;
  }
  function resumoBusca() {
    const reducao =
      (plano.antes.minutosFaltantes - plano.depois.minutosFaltantes) / 60;
    return plano.alteracoes.length
        ? `Sugestão encontrada: redução de ${fmtHoras(reducao)} horas-pessoa descobertas. ${fmtHoras(plano.depois.minutosFaltantes / 60)} continuam sem cobertura. Confira as alterações abaixo.`
        : "Nenhum ajuste seguro foi encontrado nesta busca. A escala permanece igual.";
  }
  function mostrarPrevia(texto) {
    const pessoas = state.escalaGerada.resultado;
    mensagem(texto);
    campo("previa").innerHTML =
      `<section class="diagnostico-executivo" data-situacao="${plano.depois.minutosFaltantes ? "ajustes" : "suficiente"}"><span class="diagnostico-etiqueta">${plano.alteracoes.length ? "Sugestões para revisar — ainda não aplicadas" : "Resultado da busca"}</span><h3>${plano.alteracoes.length ? "Há uma distribuição com melhor cobertura." : "Nenhuma alternativa segura encontrada nesta busca."}</h3><div class="diagnostico-indicadores"><div><span>Lacunas antes</span><strong>${fmtHoras(plano.antes.minutosFaltantes / 60)}</strong><small>Horas-pessoa</small></div><div><span>Lacunas após a sugestão</span><strong>${fmtHoras(plano.depois.minutosFaltantes / 60)}</strong><small>Horas-pessoa</small></div><div><span>Colaboradores envolvidos</span><strong>${new Set(plano.alteracoes.map(a=>a.colaboradorId)).size}</strong><small>${plano.tentativas} alternativas avaliadas</small></div></div><p>As horas semanais e os dias de trabalho foram preservados. Confira a prévia e aplique somente se os novos horários forem adequados à empresa.</p>${plano.acoes.some(a=>a.tipo === "horario_intervalo" || a.tipo === "funcoes_combinadas") ? '<p>A sugestão inclui mudanças combinadas de turno/intervalo ou realocação coordenada entre funções habilitadas.</p>' : ""}</section>${plano.explicacoes.map((t) => `<p class="text-sm text-slate-600 mt-2">${escapeHtml(t)}</p>`).join("")}${
        plano.alteracoes.length
          ? `<div class="overflow-x-auto mt-3 max-h-96"><table class="w-full text-xs border-collapse"><caption class="text-left font-semibold mb-2">Prévia — alterações ainda não aplicadas (${plano.alteracoes.length} dias)</caption><thead><tr>${["Colaborador", "Data", "Antes", "Sugestão"].map((t) => `<th class="text-left p-2 border-b">${t}</th>`).join("")}</tr></thead><tbody>${plano.alteracoes
              .map((a) => {
                const c = pessoas.find(
                  (r) => r.colaborador.id === a.colaboradorId,
                ).colaborador;
                return `<tr><td class="p-2 border-b">${escapeHtml(c.nome)}</td><td class="p-2 border-b whitespace-nowrap">${formatDateBR(dateFromKey(a.data))}</td><td class="p-2 border-b">${escapeHtml(descricao(c, a.antes))}</td><td class="p-2 border-b">${escapeHtml(descricao(c, a.depois))}</td></tr>`;
              })
              .join("")}</tbody></table></div>${
              plano.avisosValidacao?.length
                ? `<details class="mt-3 border border-slate-200 rounded-md p-3"><summary class="cursor-pointer text-sm font-semibold">Conferências da escala sugerida (${plano.avisosValidacao.length})</summary><ul class="mt-2 space-y-1 text-xs text-slate-600">${plano.avisosValidacao
                    .slice(0, 50)
                    .map(
                      (a) =>
                        `<li>${escapeHtml(a.nome)}: ${escapeHtml(a.mensagem)}</li>`,
                    )
                    .join(
                      "",
                    )}</ul>${plano.avisosValidacao.length > 50 ? '<p class="text-xs mt-2">Exibindo as primeiras 50 ocorrências; o relatório da escala aplicada mantém a lista completa.</p>' : ""}</details>`
                : ""
            }<p class="text-xs text-slate-500 mt-2">A função sugerida vale pelo plantão inteiro. Pendências documentais continuam exigindo conferência; a busca não certifica a validade do regime.</p><button type="button" data-ajuste-aplicar class="mt-3 px-4 py-2 rounded-md bg-fintria-verde text-white font-semibold text-sm">Aplicar ajustes sugeridos</button>`
          : ""
      }`;
    campo("aplicar")?.addEventListener("click", () => {
      try {
        checar();
        state.escalaGerada = aplicarAjustesCobertura(state, plano);
        plano = null;
        salvar();
      } catch (error) {
        mensagem(error.message);
      }
    });
  }
  function bindEvents() {
    if (!state.coberturaAtiva) return;
    campo("buscar")?.addEventListener("click", async () => {
      try {
        checar();
        parar();
        plano = null;
        campo("previa").innerHTML = "";
        const config = structuredClone(
          Object.fromEntries(
            Object.entries(state).filter(([key]) => key !== "conversao"),
          ),
        );
        if (typeof env.window.Worker !== "function")
          throw new Error("Atualize o navegador para usar a busca automática.");
        worker = new env.window.Worker(
          new URL("../workers/ajustes-cobertura.js", import.meta.url),
          { type: "module" },
        );
        const atual = worker,
          raiz = elemento();
        campo("buscar").disabled = true;
        campo("cancelar").hidden = false;
        campo("progresso").hidden = false;
        campo("barra").value = 0;
        campo("contador").textContent = "Preparando a busca…";
        elemento().setAttribute("aria-busy", "true");
        mensagem("Buscando alternativas de cobertura…");
        worker.onmessage = async (event) => {
          if (worker !== atual) return;
          if (elemento() !== raiz) {
            parar();
            return;
          }
          if (event.data.progresso) {
            const p = event.data.progresso;
            campo("barra").max = p.limiteTentativas;
            campo("barra").value = p.tentativas;
            campo("contador").textContent =
              `${p.tentativas} alternativas avaliadas · ${p.ajustes} ajustes encontrados`;
            return;
          }
          terminarBusca();
          try {
            checar();
            if (event.data.erro) throw new Error(event.data.erro);
            if (event.data.plano.assinaturaAntes !== assinaturaAjustes(state))
              throw new Error(
                "Os dados mudaram durante a busca. Busque novas sugestões.",
              );
            plano = event.data.plano;
            const texto = resumoBusca(), encontrado = plano;
            await env.alert(texto, {
              title: plano.alteracoes.length ? "Ajustes de cobertura encontrados" : "Resultado da busca de cobertura",
              confirmText: plano.alteracoes.length ? "Ver sugestões" : "Entendi",
            });
            if (elemento() !== raiz || plano !== encontrado) return;
            checar();
            if (plano.assinaturaAntes !== assinaturaAjustes(state))
              throw new Error("Os dados mudaram. Busque novas sugestões antes de aplicar ajustes.");
            mostrarPrevia(texto);
          } catch (error) {
            await informarErro(error.message, raiz);
          }
        };
        worker.onerror = async () => {
          if (worker !== atual) return;
          if (elemento() !== raiz) {
            parar();
            return;
          }
          terminarBusca();
          await informarErro(
            "Não foi possível concluir a busca. Confira a conexão e tente novamente.", raiz,
          );
        };
        worker.postMessage({ config });
      } catch (error) {
        terminarBusca();
        await informarErro(error.message);
      }
    });
    campo("cancelar")?.addEventListener("click", () => {
      parar();
      campo("buscar").disabled = false;
      campo("cancelar").hidden = true;
      campo("progresso").hidden = true;
      elemento().removeAttribute("aria-busy");
      mensagem("Busca cancelada. A escala foi preservada.");
      campo("buscar").focus({ preventScroll: true });
    });
    campo("desfazer")?.addEventListener("click", () => {
      try {
        checar();
        state.escalaGerada = desfazerAjustesCobertura(state);
        salvar();
        mensagem("Último ajuste desfeito. A escala anterior foi restaurada.");
      } catch (error) {
        mensagem(error.message);
      }
    });
  }
  return { renderPainel, bindEvents };
}
