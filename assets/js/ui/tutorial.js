const ETAPAS = [
  [
    "config-periodo",
    "Escolha o período",
    "Selecione o mês e o ano da escala. O sistema inicia no mês atual; use o dia de início se quiser gerar apenas parte do mês.",
  ],
  [
    "config-colaboradores",
    "Cadastre os colaboradores",
    "Adicione cada pessoa, sua função e carga contratual. Para cadastrar em lote, abra Preencher colaboradores por planilha: baixe o modelo CSV, preencha, selecione o arquivo e confira a prévia antes de confirmar. As funções serão usadas na cobertura. Confira também os dados individuais de enquadramento e proteção salarial.",
  ],
  [
    "sec-tipo",
    "Defina o tipo de escala",
    "Escolha 6×1, 5×2, 12×36 ou um modelo personalizado. A referência automática considera a vigência nas datas da escala; as outras referências simulam cenários. Preencha os dados do ACT/CCT quando houver compensação coletiva aplicável.",
  ],
  [
    "sec-feriados",
    "Confira os feriados",
    "Revise os feriados do período e adicione os locais. Informe quais serão trabalhados e escolha como os não trabalhados entram na distribuição das folgas. O abono aplicável aparece no resumo semanal.",
  ],
  [
    "sec-jornada",
    "Preencha os horários",
    "Informe entrada, intervalo e saída. Ative horários por dia para diferenças como o sábado, ou dois turnos para distribuir os grupos. No modelo 12×36, confira a data de referência do ciclo. Horários que atravessam a meia-noite exigem atenção às pendências de trabalho noturno.",
  ],
  [
    "sec-folgas",
    "Organize as folgas",
    "Escolha folgas fixas ou rotativas e os dias permitidos. Na escala 5×2, você também pode escolher sábado e domingo. Confira se as regras individuais, os dias de funcionamento e os feriados combinam com essa escolha.",
  ],
  [
    "sec-cobertura",
    "Cobertura operacional (opcional)",
    "Ative esta opção se quiser conferir o atendimento por horário e função. Escolha uma função cadastrada, a faixa de horário, o mínimo de pessoas e os dias necessários. A análise apontará períodos descobertos; ela não redistribui a equipe automaticamente.",
  ],
  [
    "sec-pec",
    "Consulte a transição da EC 141",
    "Revise as fases, os prazos e as condições descritas nesta seção. Use Comparar etapas para avaliar as referências de jornada. Confira as pendências e os documentos aplicáveis antes de utilizar a escala.",
  ],
  [
    "sec-gerar",
    "Gere e confira a escala",
    "Depois de preencher as seções, clique em Gerar escala. Confira os horários, as folgas, o resumo semanal, os alertas e a cobertura. Você pode ajustar uma célula e exportar o CSV ou imprimir. Encerrar este tutorial não gera nem altera sua escala.",
  ],
];

export function createTutorialUI({ document, window }) {
  let root,
    dialog,
    highlight,
    index = 0,
    previousFocus,
    previousOverflow;
  let inertElements = [];

  function position() {
    if (!root) return;
    const target = document.getElementById(ETAPAS[index][0]);
    const rect = target.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const left = Math.max(8, rect.left - 6);
    const top = Math.max(8, rect.top - 6);
    const right = Math.min(width - 8, rect.right + 6);
    const bottom = Math.min(height - 8, rect.bottom + 6);
    Object.assign(highlight.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });
    const card = dialog.getBoundingClientRect();
    const below = bottom + 16;
    const y =
      below + card.height <= height - 16
        ? below
        : top - card.height - 16 >= 16
          ? top - card.height - 16
          : height - card.height - 16;
    dialog.style.left = `${Math.max(16, Math.min(left, width - card.width - 16))}px`;
    dialog.style.top = `${Math.max(16, y)}px`;
  }

  function showStep() {
    const [target, title, text] = ETAPAS[index];
    root.dataset.target = target;
    root.querySelector("#tutorial-contador").textContent =
      `Etapa ${index + 1} de ${ETAPAS.length}`;
    root.querySelector("#tutorial-titulo").textContent = title;
    root.querySelector("#tutorial-texto").textContent = text;
    root.querySelector("#tutorial-anterior").disabled = index === 0;
    root.querySelector("#tutorial-proximo").textContent =
      index === ETAPAS.length - 1 ? "Concluir tutorial" : "Próxima";
    document
      .getElementById(target)
      .scrollIntoView({ behavior: "instant", block: "start" });
    window.scrollBy({ top: -16, behavior: "instant" });
    position();
    dialog.focus({ preventScroll: true });
  }

  function close() {
    if (!root) return;
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    document.removeEventListener("keydown", onKeydown, true);
    root.remove();
    root = null;
    for (const [element, inert] of inertElements) element.inert = inert;
    inertElements = [];
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
    const first = buttons[0],
      last = buttons.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === dialog)
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  function start() {
    if (root) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    root = document.createElement("div");
    root.id = "tutorial-guiado";
    root.className = "tutorial-overlay no-print";
    root.innerHTML = `<div class="tutorial-highlight" aria-hidden="true"></div>
      <div class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo" aria-describedby="tutorial-contador tutorial-texto" tabindex="-1">
        <div class="tutorial-top"><span id="tutorial-contador"></span><button type="button" id="tutorial-fechar" aria-label="Encerrar tutorial">Fechar ×</button></div>
        <div aria-live="polite" aria-atomic="true"><h2 id="tutorial-titulo"></h2><p id="tutorial-texto"></p></div>
        <p class="tutorial-dica">Use os botões para navegar. Esc encerra o tutorial.</p>
        <div class="tutorial-acoes"><button type="button" id="tutorial-anterior">Anterior</button><button type="button" id="tutorial-proximo">Próxima</button></div>
      </div>`;
    inertElements = [...document.body.children]
      .filter((el) => !["SCRIPT", "STYLE"].includes(el.tagName))
      .map((el) => [el, el.inert]);
    for (const [element] of inertElements) element.inert = true;
    document.body.append(root);
    document.body.style.overflow = "hidden";
    dialog = root.querySelector(".tutorial-card");
    highlight = root.querySelector(".tutorial-highlight");
    root.querySelector("#tutorial-fechar").onclick = close;
    root.querySelector("#tutorial-anterior").onclick = () => {
      if (index > 0) {
        index--;
        showStep();
      }
    };
    root.querySelector("#tutorial-proximo").onclick = () => {
      if (index === ETAPAS.length - 1) close();
      else {
        index++;
        showStep();
      }
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("keydown", onKeydown, true);
    index = 0;
    showStep();
  }

  return {
    bindEvents() {
      document.getElementById("btn-tutorial").onclick = start;
    },
  };
}
