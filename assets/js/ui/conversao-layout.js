/* Organização visual do resultado da proposta 5×2: abas (escala, pontos de atenção,
 * análise e conferência com o diagnóstico) e faixa de ações. A grade continua sendo
 * renderizada pelo calendário; depois de cada renderização, o painel de ajustes de
 * cobertura vai para a faixa de ações e os avisos da validação vão para "Pontos de
 * atenção". O conteúdo não muda, só o lugar onde aparece. */
const ALERTAS = "[data-erros-escala], [data-analises-escala], [data-referencia-atual], [data-cobertura-basica]";

export function initConversaoLayout(document) {
  const raiz = document.getElementById?.("conversao-resultados");
  const Observer = document.defaultView?.MutationObserver;
  const grade = document.getElementById?.("resultado-proposta");
  if (!raiz?.dataset || !grade || typeof raiz.querySelectorAll !== "function" || !Observer || raiz.dataset.layoutPronto) return null;
  raiz.dataset.layoutPronto = "true";
  const abas = [...raiz.querySelectorAll("[data-conv-aba]")];
  const painel = (nome) => raiz.querySelector(`[data-conv-painel="${nome}"]`);

  function mostrarAba(nome, { foco = false } = {}) {
    for (const aba of abas) {
      const ativa = aba.dataset.convAba === nome;
      aba.setAttribute("aria-selected", String(ativa));
      aba.tabIndex = ativa ? 0 : -1;
      painel(aba.dataset.convAba).hidden = !ativa;
      if (ativa && foco) aba.focus();
    }
    if (nome === "diagnostico") raiz.querySelector("[data-diag-conferencia]")?._conferir?.();
  }
  for (const aba of abas) {
    aba.addEventListener("click", () => mostrarAba(aba.dataset.convAba));
    aba.addEventListener("keydown", (e) => {
      const i = abas.indexOf(aba);
      const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[e.key];
      if (destino == null) return;
      e.preventDefault();
      mostrarAba(abas[(destino + abas.length) % abas.length].dataset.convAba, { foco: true });
    });
  }
  // Indicadores do resumo levam à aba correspondente.
  raiz.addEventListener("click", (e) => {
    const ir = e.target.closest("[data-conv-ir]");
    if (!ir) return;
    mostrarAba(ir.dataset.convIr);
    raiz.querySelector(".conv-abas")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  const slot = raiz.querySelector("[data-conv-slot-ajustes]");
  const alertas = raiz.querySelector("[data-conv-alertas]");
  const contador = raiz.querySelector("[data-conv-contador]");
  function organizar() {
    const ajustes = grade.querySelector(":scope > section[id$='-ajustes']");
    slot.replaceChildren(...(ajustes ? [ajustes] : []));
    slot.hidden = !ajustes;
    const avisos = [...grade.querySelectorAll(`:scope > ${ALERTAS.split(", ").join(", :scope > ")}`)];
    alertas.replaceChildren(...avisos);
    if (!avisos.length) alertas.innerHTML = '<p class="conv-painel-intro">Nenhum ponto de atenção na validação da escala proposta.</p>';
    const erros = alertas.querySelectorAll("[data-erros-escala] .aviso-escala").length;
    const total = alertas.querySelectorAll(".aviso-escala").length + alertas.querySelectorAll("[data-cobertura-basica]").length;
    contador.hidden = !total;
    contador.textContent = String(total);
    contador.dataset.nivel = erros ? "erro" : "alerta";
    contador.setAttribute("aria-label", `${total} ${erros ? "incluindo incompatibilidades" : "itens"}`);
  }
  // Só reage quando o calendário insere conteúdo novo (as remoções são as nossas).
  new Observer((mutacoes) => {
    if (mutacoes.some((m) => m.addedNodes.length)) organizar();
  }).observe(grade, { childList: true });
  organizar();
  return { mostrarAba, organizar };
}
