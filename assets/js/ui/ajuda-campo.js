import { escapeHtml as esc } from "../shared/formatacao.js";

export function ajudaCampo(id, titulo, texto) {
  const alvo = `ajuda-${id}`;
  return `<span class="campo-ajuda"><button type="button" class="campo-ajuda-botao" data-ajuda="${esc(alvo)}" popovertarget="${esc(alvo)}" aria-label="Ajuda: ${esc(titulo)}" aria-controls="${esc(alvo)}" aria-expanded="false">?</button><span id="${esc(alvo)}" class="campo-ajuda-conteudo" popover="auto" role="tooltip">${esc(texto)}</span></span>`;
}

const raizes = new WeakSet();
export function bindAjudas(root) {
  const doc = root.ownerDocument;
  if (!doc?.defaultView) return;
  for (const button of root.querySelectorAll("[data-ajuda]")) {
    const panel = doc.getElementById(button.dataset.ajuda);
    let fixado = false;
    const aberto = () => panel.matches(":popover-open");
    function mostrar() {
      if (!aberto()) panel.showPopover();
      const rect = button.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      panel.style.left = `${Math.max(12, Math.min(rect.left, doc.documentElement.clientWidth - width - 12))}px`;
      const height = panel.getBoundingClientRect().height;
      panel.style.top = `${Math.max(12, rect.bottom + height + 12 > doc.documentElement.clientHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
      button.setAttribute("aria-describedby", panel.id);
      button.setAttribute("aria-expanded", "true");
    }
    function esconder() {
      if (aberto()) panel.hidePopover();
      button.setAttribute("aria-expanded", "false");
      button.removeAttribute("aria-describedby");
      fixado = false;
    }
    button.onpointerenter = (event) => {
      if (event.pointerType !== "touch") mostrar();
    };
    button.onfocus = mostrar;
    button.onclick = (event) => {
      event.preventDefault();
      if (fixado && aberto()) esconder();
      else {
        mostrar();
        fixado = true;
      }
    };
    button.onpointerleave = (event) => {
      if (!fixado && doc.activeElement !== button && !panel.contains(event.relatedTarget)) esconder();
    };
    panel.onpointerleave = () => {
      if (!fixado && doc.activeElement !== button) esconder();
    };
    button.onblur = () => {
      if (!fixado) esconder();
    };
    panel.addEventListener("beforetoggle", (event) => {
      if (event.newState === "closed") {
        fixado = false;
        button.setAttribute("aria-expanded", "false");
        button.removeAttribute("aria-describedby");
      }
    });
  }
  if (!raizes.has(root)) {
    raizes.add(root);
    const fechar = () => {
      for (const panel of root.querySelectorAll(".campo-ajuda-conteudo:popover-open")) panel.hidePopover();
    };
    doc.addEventListener("scroll", (event) => {
      if (!event.target.closest?.(".campo-ajuda-conteudo")) fechar();
    }, true);
    doc.defaultView.addEventListener("resize", fechar);
  }
}
