const ETAPAS = [
  [
    "config-periodo",
    "Escolha o período",
    "Informe o mês e o ano da escala atual 6×1. O sistema inicia no mês atual. Preencha as próximas seções como a empresa funciona hoje; o mês de destino da proposta 5×2 será escolhido ao final.",
  ],
  [
    "config-colaboradores",
    "Cadastre os colaboradores",
    "Use Definir horário individual por dia quando necessário. Escolha o modelo CSV, o cadastro manual ou Importar planilha da Domínio — Quadro de Horário de Trabalho. Confira a prévia antes de importar. Na Domínio, os horários são individuais; revise campos ausentes e datas iniciais de ciclos na lista Colaboradores cadastrados/importados, ao final da seção. As três áreas abrem ao clicar no título. Na lista, marque Funções habilitadas para cobertura quando a pessoa puder exercer outros cargos. Abra Restrições individuais para informar férias, afastamentos, indisponibilidades, folgas obrigatórias e horários permitidos, quando houver.",
  ],
  [
    "sec-tipo",
    "Defina o tipo de escala",
    "Para converter, mantenha 6×1 como modelo atual. Informe o ACT/CCT quando houver compensação coletiva aplicável. Os demais modelos e a referência desta seção continuam disponíveis para escalas avulsas; a fase da conversão será escolhida no destino.",
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
    "Informe as folgas atuais e os dias permitidos para distribuição. A conversão respeita os dias de funcionamento e busca distribuir as folgas da equipe. Se quiser sábado e domingo fixos na proposta, escolha essa opção no destino, ao final.",
  ],
  [
    "sec-cobertura",
    "Cobertura operacional (opcional)",
    "Ative esta opção e informe o mínimo de pessoas por função, horário e dia para avaliar se o quadro atende à empresa. A conversão buscará distribuir folgas para reduzir lacunas. Sem essa demanda, o sistema pode gerar a proposta, mas não pode concluir se a equipe é suficiente.",
  ],
  [
    "sec-pec",
    "Consulte a transição da EC 141",
    "Revise as fases, os prazos e as condições descritas nesta seção. Confira as pendências e os documentos aplicáveis antes de utilizar a escala.",
  ],
  [
    "sec-gerar",
    "Converta e compare",
    "Escolha o mês da proposta, a fase automática ou simulada e como distribuir as folgas. Clique em Gerar proposta 5×2 e comparar. Confira a suficiência da equipe, os horários descobertos e as mudanças por pessoa. A escala original fica preservada; ajustes na proposta recalculam a comparação. Depois, exporte o CSV da proposta ou imprima.",
  ],
];

export function createTutorialUI({ document, window, etapas, state }) {
  const etapasAtivas = () => ETAPAS.filter(([id]) => state?.modeloEscala !== "fixa" || id !== "sec-feriados").map((etapa) => {
    if (state?.modeloEscala !== "fixa") return etapa;
    if (etapa[0] === "config-periodo") return [etapa[0], "Escolha o modelo de escala", "No padrão fixo, horários e folgas se repetem por dia da semana. Informe a data de referência para conferir a legislação e a vigência do ACT/CCT. Feriados e eventos por data pertencem ao modo dinâmico."];
    if (etapa[0] === "config-colaboradores") return [etapa[0], "Cadastre os colaboradores", "Use planilha, Domínio ou cadastro manual. Confira as jornadas individuais e a carga contratual. Restrições semanais de dias e horários são respeitadas; férias, afastamentos e admissão por data não são aplicados ao padrão fixo. Ciclos como 12×36 precisam do modo dinâmico."];
    if (etapa[0] === "sec-jornada") return [etapa[0], "Preencha os horários recorrentes", "Informe entrada, intervalo e saída para os dias da semana. Use horários por dia para diferenças como o sábado. Em dois turnos, os grupos A/B serão fixos, sem alternância semanal. Jornadas noturnas mantêm a indicação de saída no dia seguinte e a verificação dos descansos."];
    if (etapa[0] === "sec-gerar") return [etapa[0], "Converta o padrão e compare", "Escolha a fase legal para gerar o padrão fixo 5×2. Confira o resumo semanal, a cobertura e as incompatibilidades. A fase automática usa a data de referência; fases futuras escolhidas manualmente são simulações. Para ajustar o padrão, revise o cadastro e gere novamente."];
    return etapa;
  });
  let root,
    dialog,
    highlight,
    index = 0,
    previousFocus,
    previousOverflow;
  let inertElements = [];
  let etapaAnterior,
    manualPosition = null,
    drag = null;

  function moveCard(x, y) {
    const card = dialog.getBoundingClientRect();
    manualPosition = {
      x: Math.max(
        8,
        Math.min(x, document.documentElement.clientWidth - card.width - 8),
      ),
      y: Math.max(8, Math.min(y, window.innerHeight - card.height - 8)),
    };
    dialog.style.left = `${manualPosition.x}px`;
    dialog.style.top = `${manualPosition.y}px`;
  }

  function position() {
    if (!root) return;
    const target = document.getElementById(etapasAtivas()[index][0]);
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
    if (manualPosition) {
      moveCard(manualPosition.x, manualPosition.y);
      return;
    }
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
    const [target, title, text] = etapasAtivas()[index];
    etapas?.mostrarAlvo(target, {
      historico: false,
      registrarVisita: false,
      foco: false,
      rolar: false,
    });
    root.dataset.target = target;
    root.querySelector("#tutorial-contador").textContent =
      `Etapa ${index + 1} de ${etapasAtivas().length}`;
    root.querySelector("#tutorial-titulo").textContent = title;
    root.querySelector("#tutorial-texto").textContent = text;
    root.querySelector("#tutorial-anterior").disabled = index === 0;
    root.querySelector("#tutorial-proximo").textContent =
      index === etapasAtivas().length - 1 ? "Concluir tutorial" : "Próxima";
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
    drag = null;
    manualPosition = null;
    root.remove();
    root = null;
    for (const [element, inert] of inertElements) element.inert = inert;
    inertElements = [];
    document.body.style.overflow = previousOverflow;
    if (etapaAnterior)
      etapas.mostrarAlvo(etapaAnterior, {
        historico: false,
        registrarVisita: false,
        foco: false,
      });
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (
      event.target.matches?.("[data-tutorial-drag]") &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const card = dialog.getBoundingClientRect();
      moveCard(
        card.left +
          (event.key === "ArrowRight"
            ? 16
            : event.key === "ArrowLeft"
              ? -16
              : 0),
        card.top +
          (event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0),
      );
    }
    if (event.key !== "Tab") return;
    const buttons = [
      ...dialog.querySelectorAll("[data-tutorial-drag], button:not(:disabled)"),
    ];
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
    etapaAnterior = etapas?.etapaAtual();
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    root = document.createElement("div");
    root.id = "tutorial-guiado";
    root.className = "tutorial-overlay no-print";
    root.innerHTML = `<div class="tutorial-highlight" aria-hidden="true"></div>
      <div class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo" aria-describedby="tutorial-contador tutorial-texto" tabindex="-1">
        <div class="tutorial-top" data-tutorial-drag tabindex="0" role="group" aria-label="Mover janela do tutorial. Arraste ou use as setas do teclado."><span id="tutorial-contador"></span><button type="button" id="tutorial-fechar" aria-label="Encerrar tutorial">Fechar ×</button></div>
        <div aria-live="polite" aria-atomic="true"><h2 id="tutorial-titulo"></h2><p id="tutorial-texto"></p></div>
        <p class="tutorial-dica">Arraste pelo cabeçalho para mover esta janela. Com o cabeçalho em foco, use as setas. Esc encerra o tutorial.</p>
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
    const handle = root.querySelector("[data-tutorial-drag]");
    handle.addEventListener("pointerdown", (event) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        event.target.closest("button")
      )
        return;
      const card = dialog.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: card.left,
        top: card.top,
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-dragging");
      event.preventDefault();
      handle.focus({ preventScroll: true });
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      moveCard(
        drag.left + event.clientX - drag.x,
        drag.top + event.clientY - drag.y,
      );
    });
    const stopDrag = () => {
      drag = null;
      handle.classList.remove("is-dragging");
    };
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointercancel", stopDrag);
    handle.addEventListener("lostpointercapture", stopDrag);
    root.querySelector("#tutorial-fechar").onclick = close;
    root.querySelector("#tutorial-anterior").onclick = () => {
      if (index > 0) {
        index--;
        showStep();
      }
    };
    root.querySelector("#tutorial-proximo").onclick = () => {
      if (index === etapasAtivas().length - 1) close();
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
