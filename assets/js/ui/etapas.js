export function createEtapasUI({ document, window }) {
  const nav = document.getElementById("etapas-nav");
  const links = [...nav.querySelectorAll("[data-etapa-link]")];
  const paineis = links.map((link) =>
    document.getElementById(link.dataset.etapaLink),
  );
  const anterior = document.getElementById("etapa-anterior");
  const proxima = document.getElementById("etapa-proxima");
  let atual = 0;

  function mostrarAlvo(
    alvo,
    { historico = true, foco = true, rolar = true } = {},
  ) {
    const target =
      typeof alvo === "string"
        ? document.getElementById(alvo.replace(/^#/, ""))
        : alvo;
    const indice = paineis.findIndex(
      (painel) => painel === target || painel.contains(target),
    );
    if (indice < 0) return false;
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
    etapaAtual: () => paineis[atual].id,
    init() {
      daUrl(false);
    },
    bindEvents() {
      for (const painel of paineis) {
        const titulo = painel.querySelector("h2");
        titulo.tabIndex = -1;
        titulo.id ||= `${painel.id}-titulo`;
        painel.setAttribute("aria-labelledby", titulo.id);
      }
      links.forEach((link, i) => {
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
    },
  };
}
