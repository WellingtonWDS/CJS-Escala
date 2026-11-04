/** Mantém as duas barras sincronizadas sem devolver eventos programáticos
 * atrasados ao gesto atual. Alturas só são medidas quando o layout muda. */
export function configurarRolagemEscala(container, window, posicao = {}) {
  const viewport = container.querySelector("[data-rolagem-escala]");
  const topo = container.querySelector("[data-rolagem-topo]");
  const espaco = container.querySelector("[data-rolagem-espaco]");
  const botao = container.querySelector("[data-ver-resumo]");
  const tabela = viewport?.querySelector("table");
  if (!viewport || !topo || !espaco || !tabela) return () => {};
  let observador = null, conteudo = null, ativo = true;
  let frame = null, medirNoFrame = false, larguraMedida = null;
  const esperados = new Map();

  function espelhar(origem, destino) {
    if (Math.abs(destino.scrollLeft - origem.scrollLeft) <= 0.5) return;
    destino.scrollLeft = origem.scrollLeft;
    // Ler o valor efetivo considera arredondamento e limites da barra.
    esperados.set(destino, destino.scrollLeft);
  }
  function rolar(origem, destino) {
    const esperado = esperados.get(origem);
    esperados.delete(origem);
    if (esperado != null && Math.abs(origem.scrollLeft - esperado) <= 0.5) return;
    espelhar(origem, destino);
  }
  const rolarTopo = () => rolar(topo, viewport);
  const rolarQuadro = () => rolar(viewport, topo);
  function verResumo() {
    viewport.scrollLeft = viewport.scrollWidth;
    esperados.set(viewport, viewport.scrollLeft);
    espelhar(viewport, topo);
  }
  function limpar() {
    ativo = false;
    observador?.disconnect();
    conteudo?.disconnect();
    if (frame != null) window.cancelAnimationFrame(frame);
    topo.removeEventListener("scroll", rolarTopo);
    viewport.removeEventListener("scroll", rolarQuadro);
    botao.removeEventListener("click", verResumo);
    window.removeEventListener("resize", redimensionar);
    window.removeEventListener("beforeprint", atualizarCompleto);
    window.removeEventListener("afterprint", atualizarCompleto);
  }
  function atualizar(forcarMedicao = false) {
    if (!ativo) return;
    if (!viewport.isConnected) { limpar(); return; }
    if (!viewport.clientWidth) return;
    const largura = tabela.getBoundingClientRect().width;
    if (forcarMedicao || largura !== larguraMedida) {
      const cards = [...tabela.querySelectorAll(".escala-colaborador")];
      tabela.style.setProperty("--altura-card", "110px");
      cards.forEach(card => { card.style.height = "auto"; });
      const altura = Math.ceil(Math.max(110, ...cards.map(card => card.getBoundingClientRect().height)));
      tabela.style.setProperty("--altura-card", `${altura}px`);
      cards.forEach(card => { card.style.height = `${altura}px`; });
      larguraMedida = largura;
    }
    const excede = viewport.scrollWidth > viewport.clientWidth + 1;
    topo.hidden = !excede;
    botao.hidden = !excede;
    const larguraEspaco = `${viewport.scrollWidth + Math.max(0, topo.clientWidth - viewport.clientWidth)}px`;
    if (espaco.style.width !== larguraEspaco) espaco.style.width = larguraEspaco;
    espelhar(viewport, topo);
  }
  function agendar(medir = false) {
    if (!ativo) return;
    medirNoFrame ||= medir;
    if (frame != null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      const forcar = medirNoFrame;
      medirNoFrame = false;
      atualizar(forcar);
    });
  }
  const redimensionar = () => agendar();
  const mudouConteudo = () => agendar(true);
  const atualizarCompleto = () => atualizar(true);

  topo.addEventListener("scroll", rolarTopo, { passive: true });
  viewport.addEventListener("scroll", rolarQuadro, { passive: true });
  botao.addEventListener("click", verResumo);
  atualizar();
  viewport.scrollLeft = posicao.left || 0;
  viewport.scrollTop = posicao.top || 0;
  esperados.set(viewport, viewport.scrollLeft);
  espelhar(viewport, topo);
  observador = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(redimensionar) : null;
  observador?.observe(viewport);
  observador?.observe(tabela);
  // Filtrar/reexibir colaboradores pode mudar a maior altura mesmo sem mudar
  // a largura. Ignora estilos que a própria medição escreve nos cards.
  conteudo = typeof window.MutationObserver === "function" ? new window.MutationObserver(mudouConteudo) : null;
  conteudo?.observe(tabela, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", redimensionar);
  window.addEventListener("beforeprint", atualizarCompleto);
  window.addEventListener("afterprint", atualizarCompleto);
  window.document?.fonts?.ready?.then(() => { if (ativo) atualizarCompleto(); });
  return limpar;
}
