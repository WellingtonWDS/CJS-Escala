/** Mantém a barra superior sincronizada e o resumo acessível após redimensionar. */
export function configurarRolagemEscala(container, window, posicao = {}) {
  const viewport = container.querySelector("[data-rolagem-escala]");
  const topo = container.querySelector("[data-rolagem-topo]");
  const espaco = container.querySelector("[data-rolagem-espaco]");
  const botao = container.querySelector("[data-ver-resumo]");
  const tabela = viewport?.querySelector("table");
  if (!viewport || !topo || !espaco || !tabela) return () => {};
  let observador = null;
  function limpar() {
    observador?.disconnect();
    window.removeEventListener("resize", atualizar);
    window.removeEventListener("beforeprint", atualizar);
    window.removeEventListener("afterprint", atualizar);
  }
  const atualizar = () => {
    if (!viewport.isConnected) {
      limpar();
      return;
    }
    if (!viewport.clientWidth) return;
    const cards = [...tabela.querySelectorAll(".escala-colaborador")];
    // Mede o conteúdo natural, sem truncar nomes, horários ou intervalos.
    tabela.style.setProperty("--altura-card", "110px");
    cards.forEach((card) => {
      card.style.height = "auto";
    });
    const altura = Math.ceil(
      Math.max(
        110,
        ...cards.map((card) => card.getBoundingClientRect().height),
      ),
    );
    tabela.style.setProperty("--altura-card", `${altura}px`);
    cards.forEach((card) => {
      card.style.height = `${altura}px`;
    });
    const excede = viewport.scrollWidth > viewport.clientWidth + 1;
    topo.hidden = !excede;
    botao.hidden = !excede;
    espaco.style.width = `${viewport.scrollWidth + Math.max(0, topo.clientWidth - viewport.clientWidth)}px`;
    topo.scrollLeft = viewport.scrollLeft;
  };
  topo.addEventListener("scroll", () => {
    if (Math.abs(viewport.scrollLeft - topo.scrollLeft) > 1)
      viewport.scrollLeft = topo.scrollLeft;
  });
  viewport.addEventListener("scroll", () => {
    if (Math.abs(topo.scrollLeft - viewport.scrollLeft) > 1)
      topo.scrollLeft = viewport.scrollLeft;
  });
  botao.addEventListener("click", () => {
    viewport.scrollLeft = viewport.scrollWidth;
    topo.scrollLeft = viewport.scrollLeft;
  });
  atualizar();
  viewport.scrollLeft = posicao.left || 0;
  viewport.scrollTop = posicao.top || 0;
  topo.scrollLeft = viewport.scrollLeft;
  observador =
    typeof window.ResizeObserver === "function"
      ? new window.ResizeObserver(atualizar)
      : null;
  observador?.observe(viewport);
  observador?.observe(tabela);
  window.addEventListener("resize", atualizar);
  window.addEventListener("beforeprint", atualizar);
  window.addEventListener("afterprint", atualizar);
  window.document?.fonts?.ready?.then(atualizar);
  return limpar;
}
