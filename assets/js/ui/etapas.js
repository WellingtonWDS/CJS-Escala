import { pendenciasPreenchimento } from "../domain/preenchimento.js";
import { escapeHtml } from "../shared/formatacao.js";
export function createEtapasUI({ document, window, state }) {
  const nav = document.getElementById("etapas-nav");
  const links = [...nav.querySelectorAll("[data-etapa-link]")];
  const paineis = links.map((link) =>
    document.getElementById(link.dataset.etapaLink),
  );
  const anterior = document.getElementById("etapa-anterior");
  const proxima = document.getElementById("etapa-proxima");
  let atual = 0,
    etapaUsuario = null,
    tentouGerar = false;
  const revisadas = new Set();
  const destino = () => ({
    periodo: document.getElementById("conversao-periodo").value,
    fase: document.getElementById("conversao-fase").value,
    folgas: document.getElementById("conversao-folgas").value,
  });
  const pendencias = () =>
    state ? pendenciasPreenchimento(state, destino()) : [];
  function listaHtml(lista) {
    return `<p><strong>Preenchimento obrigatório pendente</strong></p><ul>${lista.map((p) => `<li><button type="button" data-pendencia-etapa="${escapeHtml(p.etapa)}" data-pendencia-seletor="${escapeHtml(p.seletor)}">${escapeHtml(p.mensagem)}</button></li>`).join("")}</ul>`;
  }
  function atualizarPendencias() {
    const todas = pendencias();
    links.forEach((link, i) => {
      const lista = todas.filter((p) => p.etapa === paineis[i].id);
      const sinalizar = revisadas.has(paineis[i].id) && lista.length > 0;
      link.toggleAttribute("data-pendente", sinalizar);
      const aviso = document.getElementById(`${paineis[i].id}-pendencias`);
      aviso.hidden = !sinalizar;
      const html = sinalizar ? listaHtml(lista) : "";
      if (aviso.innerHTML !== html) aviso.innerHTML = html;
      link.title = sinalizar
        ? lista.map((p) => p.mensagem).join(" ")
        : link.dataset.titulo;
      const texto = link.querySelector(".etapa-pendencia-texto");
      texto.textContent = sinalizar
        ? ` — ${lista.length} pendência(s) de preenchimento`
        : "";
    });
    const resumo = document.getElementById("preenchimento-bloqueio");
    if (resumo) {
      resumo.hidden = !tentouGerar || !todas.length;
      const html =
        tentouGerar && todas.length
          ? `<p>Complete os campos abaixo antes de gerar a nova proposta.</p>${listaHtml(todas)}`
          : "";
      if (resumo.innerHTML !== html) resumo.innerHTML = html;
    }
    return todas;
  }
  function validarGeracao() {
    tentouGerar = true;
    const todas = atualizarPendencias();
    if (!todas.length) return true;
    const resumo = document.getElementById("preenchimento-bloqueio");
    resumo.focus({ preventScroll: true });
    resumo.scrollIntoView({ block: "center", behavior: "instant" });
    return false;
  }

  function mostrarAlvo(
    alvo,
    {
      historico = true,
      foco = true,
      rolar = true,
      registrarVisita = true,
    } = {},
  ) {
    const target =
      typeof alvo === "string"
        ? document.getElementById(alvo.replace(/^#/, ""))
        : alvo;
    const indice = paineis.findIndex(
      (painel) => painel === target || painel.contains(target),
    );
    if (indice < 0) return false;
    if (registrarVisita) {
      if (etapaUsuario !== null && etapaUsuario !== indice)
        revisadas.add(paineis[etapaUsuario].id);
      etapaUsuario = indice;
    }
    atual = indice;
    paineis.forEach((painel, i) => {
      painel.hidden = i !== atual;
    });
    links.forEach((link, i) => {
      if (i === atual) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    const titulo = links[atual].dataset.titulo;
    document.getElementById("etapas-status").textContent =
      `Etapa ${atual + 1} de ${links.length} — ${titulo}`;
    anterior.disabled = atual === 0;
    proxima.hidden = atual === links.length - 1;
    anterior.textContent =
      atual > 0 ? `← Voltar: ${links[atual - 1].dataset.titulo}` : "← Voltar";
    proxima.textContent =
      atual < links.length - 1
        ? `Avançar: ${links[atual + 1].dataset.titulo} →`
        : "Avançar →";
    if (historico && window.location.hash !== `#${paineis[atual].id}`)
      window.history.pushState(null, "", `#${paineis[atual].id}`);
    if (foco) paineis[atual].querySelector("h2").focus({ preventScroll: true });
    if (rolar) {
      links[atual].scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
      (target || paineis[atual]).scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
    if (registrarVisita) atualizarPendencias();
    return true;
  }
  function daUrl(foco = true) {
    let id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      id = "";
    }
    if (!mostrarAlvo(id, { historico: false, foco, rolar: foco }))
      mostrarAlvo(paineis[0], { historico: false, foco, rolar: foco });
  }
  return {
    mostrarAlvo,
    validarGeracao,
    atualizarPendencias,
    etapaAtual: () => paineis[atual].id,
    init() {
      daUrl(false);
      atualizarPendencias();
    },
    bindEvents() {
      for (const painel of paineis) {
        const titulo = painel.querySelector("h2");
        titulo.tabIndex = -1;
        titulo.id ||= `${painel.id}-titulo`;
        painel.setAttribute("aria-labelledby", titulo.id);
        const aviso = document.createElement("div");
        aviso.id = `${painel.id}-pendencias`;
        aviso.className = "etapa-pendencias no-print";
        aviso.hidden = true;
        titulo.insertAdjacentElement("afterend", aviso);
      }
      links.forEach((link, i) => {
        const dot = document.createElement("span");
        dot.className = "etapa-pendencia-dot";
        dot.setAttribute("aria-hidden", "true");
        const texto = document.createElement("span");
        texto.className = "etapa-pendencia-texto";
        link.append(dot, texto);
        link.onclick = (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          mostrarAlvo(paineis[i]);
        };
        link.onkeydown = (event) => {
          let index;
          if (event.key === "ArrowRight") index = (i + 1) % links.length;
          if (event.key === "ArrowLeft")
            index = (i - 1 + links.length) % links.length;
          if (event.key === "Home") index = 0;
          if (event.key === "End") index = links.length - 1;
          if (index === undefined) return;
          event.preventDefault();
          mostrarAlvo(paineis[index], { foco: false, rolar: false });
          links[index].focus();
          links[index].scrollIntoView({ block: "nearest", inline: "nearest" });
        };
      });
      anterior.onclick = () => {
        if (atual > 0) mostrarAlvo(paineis[atual - 1]);
      };
      proxima.onclick = () => {
        if (atual < paineis.length - 1) mostrarAlvo(paineis[atual + 1]);
      };
      window.addEventListener("hashchange", () => daUrl());
      document.addEventListener?.("change", atualizarPendencias);
      document.addEventListener?.("click", (event) => {
        const botao = event.target.closest("[data-pendencia-etapa]");
        if (botao) {
          mostrarAlvo(botao.dataset.pendenciaEtapa);
          const campo = document.querySelector(botao.dataset.pendenciaSeletor);
          if (campo) {
            let ancestor = campo;
            while (ancestor) {
              if (ancestor.tagName === "DETAILS") ancestor.open = true;
              ancestor = ancestor.parentElement;
            }
            const foco = campo.matches("input,select,button")
              ? campo
              : campo.querySelector("input,select,button,summary");
            (foco || campo).focus?.({ preventScroll: true });
            campo.scrollIntoView({ block: "center", behavior: "instant" });
          }
        }
        if (event.target.closest("main > section[data-etapa]"))
          atualizarPendencias();
      });
    },
  };
}
