import { createCompanyPicker } from "./company-picker.js";
import { getDialogs } from "./dialogs.js";
import { createRemotePersistence } from "../services/persistence.js";
import { createDefaultState } from "../state/store.js";
import { validateSnapshot } from "../state/workspace.js";
import { companyLabel } from "../shared/empresas.js";

export async function initRemoteWorkspace({
  app,
  workspace,
  document,
  window,
  service = createRemotePersistence(),
}) {
  const dialogs = getDialogs(document),
    button = document.getElementById("btn-remote-workspace"),
    dialog = document.getElementById("remote-workspace"),
    bar = document.getElementById("current-workspace");
  button.hidden = false;
  bar.hidden = false;
  dialog.dataset.loadingLabel = "Carregando empresas e preenchimentos";
  bar.dataset.loadingLabel = "Salvando o preenchimento da empresa";
  bar.innerHTML = `<div class="workspace-context"><span class="workspace-eyebrow">Empresa atual e Preenchimentos</span><strong data-current-company>Nenhuma empresa selecionada</strong><span data-current-office></span><button type="button" data-current-open>Trocar empresa ou abrir preenchimento</button></div><div class="workspace-saving"><label>Nome do preenchimento<input data-remote-title maxlength="160" placeholder="Ex.: Escala de outubro" autocomplete="off"></label><div class="workspace-buttons"><button type="button" data-remote-save>Salvar preenchimento</button><button type="button" data-remote-new>Salvar uma cópia</button></div><p data-current-status role="status" aria-live="polite"></p></div>`;
  dialog.innerHTML = `<form method="dialog"><button class="remote-close" aria-label="Fechar">×</button></form><h2>Empresa atual e Preenchimentos</h2><p>Escolha a empresa e o preenchimento que deseja abrir.</p><div class="workspace-selector-scroll"><div class="workspace-choice-group"><h3>1. Escolha a empresa</h3><label>Escritório<select data-remote-office></select></label><label>Buscar por razão social ou CNPJ<input data-remote-company-search type="search" placeholder="Digite a razão social ou CNPJ"></label><label>Empresa<select data-remote-company></select></label></div><div class="workspace-choice-group"><h3>2. Escolha o preenchimento</h3><label>Preenchimentos desta empresa<select data-remote-draft></select></label><button type="button" class="workspace-delete" data-remote-delete disabled>Excluir preenchimento selecionado</button><p data-remote-preview>Comece um novo preenchimento ou abra um dos anteriores.</p></div><details class="workspace-recovery"><summary>Recuperação e importação de dados</summary><p>Estas ações usam a empresa e o preenchimento que já estão abertos no sistema.</p><div class="remote-actions"><button type="button" data-remote-restore>Recuperar preenchimento local anterior</button><button type="button" data-remote-import>Importar dados antigos deste navegador</button></div></details></div><p data-remote-status role="status" aria-live="polite"></p><div class="remote-actions workspace-open-actions"><button type="button" data-remote-open>Usar esta empresa</button></div>`;
  const field = (k) => document.querySelector(`[data-remote-${k}]`),
    current = (k) => bar.querySelector(`[data-current-${k}]`);
  let busy = false,
    generation = 0,
    contextGeneration = 0,
    contextKey = "",
    companyName = "",
    officeName = "",
    dirty = false,
    titleKnown = false,
    unavailable = false;
  const loadedDrafts = new Map();
  const status = (text) => {
    (dialog.open ? field("status") : current("status")).textContent = text;
  };
  const picker = createCompanyPicker({
    input: field("company-search"),
    select: field("company"),
    onChange: () => run(drafts),
  });
  const selected = () => ({
    officeId: field("office").value,
    companyId: field("company").value,
    draftId: field("draft").value || null,
  });
  function updateButtons() {
    const c = workspace.context(),
      pending = workspace.pending();
    field("save").disabled = busy || !c || !titleKnown || unavailable;
    field("delete").disabled =
      busy || !selected().draftId || !loadedDrafts.has(selected().draftId);
    field("new").disabled = busy || !c || !!pending || !titleKnown;
    field("title").disabled = busy || !c;
    field("save").textContent = pending
      ? "Concluir salvamento"
      : "Salvar preenchimento";
    bar.dataset.draftId = c?.draftId || "";
    current("company").textContent = c
      ? companyName || "Empresa selecionada"
      : "Nenhuma empresa selecionada";
    current("office").textContent = c
      ? officeName
      : "Selecione uma empresa para salvar e compartilhar o preenchimento.";
  }
  function activeContext() {
    const c = workspace.context();
    if (!c) throw Error("Selecione e abra uma empresa antes de salvar.");
    return c;
  }
  function checkContext() {
    const c = activeContext(),
      s = selected();
    if (
      c.officeId !== s.officeId ||
      c.companyId !== s.companyId ||
      c.draftId !== s.draftId
    )
      throw Error(
        "Para recuperar ou importar dados, selecione o preenchimento que já está aberto.",
      );
    return c;
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    const root = dialog.open ? dialog : bar;
    root.setAttribute("aria-busy", "true");
    dialog
      .querySelectorAll("select,input,.remote-actions button")
      .forEach((el) => (el.disabled = true));
    current("open").disabled = true;
    updateButtons();
    try {
      await task();
    } catch (error) {
      status(
        error.status === 401
          ? "A sessão expirou. Entre novamente."
          : error.message || "Não foi possível concluir a operação.",
      );
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      dialog
        .querySelectorAll("select,input,.remote-actions button")
        .forEach((el) => (el.disabled = false));
      current("open").disabled = false;
      updateButtons();
    }
  }
  async function refreshCurrent() {
    const c = workspace.context(),
      request = ++contextGeneration,
      key = c ? `${c.officeId}:${c.companyId}:${c.draftId || "new"}` : "";
    if (key !== contextKey) {
      contextKey = key;
      dirty = false;
      unavailable = false;
      companyName = "";
      officeName = "";
      titleKnown = !c?.draftId || !!workspace.pending();
      field("title").value =
        workspace.pending()?.title ||
        (c?.draftId ? "" : "Planejamento de escala");
    }
    updateButtons();
    if (!c) return;
    const originalTitle = field("title").value;
    try {
      const [offices, companies] = await Promise.all([
        service.listOffices(),
        service.listCompanies(c.officeId),
      ]);
      if (request !== contextGeneration) return;
      const company = companies.find((row) => row.id === c.companyId);
      if (!company)
        throw Error(
          "O acesso à empresa precisa ser conferido. Reabra a seleção.",
        );
      companyName = companyLabel(company);
      officeName = offices.find((row) => row.id === c.officeId)?.name || "";
      updateButtons();
      if (c.draftId && !workspace.pending()) {
        const row = await service.getDraft(c.officeId, c.companyId, c.draftId);
        if (
          request === contextGeneration &&
          field("title").value === originalTitle &&
          !dirty
        ) {
          field("title").value = row.title;
          titleKnown = true;
          updateButtons();
        }
      }
      if (request === contextGeneration && !dirty)
        current("status").textContent = workspace.pending()
          ? "Há um envio pendente. Use Concluir salvamento para confirmar sem duplicar."
          : c.draftId
            ? "Preenchimento aberto. Use Salvar preenchimento após alterar os dados ou gerar a escala."
            : "Novo preenchimento. Salve para disponibilizá-lo aos usuários desta empresa.";
    } catch (error) {
      if (request === contextGeneration) {
        if (error.status === 404 && c.draftId) {
          unavailable = true;
          titleKnown = true;
          if (!field("title").value)
            field("title").value = "Cópia do preenchimento local";
          updateButtons();
        }
        current("status").textContent = unavailable
          ? "Este preenchimento foi excluído ou não está mais disponível. Abra outro ou salve uma cópia dos dados locais."
          : error.message || "Não foi possível atualizar a empresa atual.";
      }
    }
  }
  function option(value, label) {
    return new Option(label, value);
  }
  function preview() {
    const saved = !!field("draft").value;
    field("open").textContent = saved
      ? "Abrir preenchimento"
      : "Começar novo preenchimento";
    field("preview").textContent = saved
      ? "Abre os dados salvos deste preenchimento."
      : "Usa um preenchimento ainda não salvo nesta empresa. Os preenchimentos já salvos permanecem preservados.";
    updateButtons();
  }
  async function drafts() {
    const request = ++generation,
      s = selected();
    loadedDrafts.clear();
    field("draft").replaceChildren(option("", "Novo preenchimento"));
    if (!s.officeId || !s.companyId) {
      preview();
      return;
    }
    const rows = await service.listDrafts(s.officeId, s.companyId);
    if (request !== generation) return;
    rows.forEach((row) => loadedDrafts.set(row.id, row));
    field("draft").append(
      ...rows.map((row) =>
        option(row.id, `${row.title} · revisão ${row.revision}`),
      ),
    );
    const c = workspace.context();
    if (c?.officeId === s.officeId && c.companyId === s.companyId) {
      if (c.draftId && !rows.some((row) => row.id === c.draftId)) {
        const row = await service.getDraft(c.officeId, c.companyId, c.draftId);
        loadedDrafts.set(row.id, row);
        field("draft").append(
          option(row.id, `${row.title} · revisão ${row.revision}`),
        );
      }
      field("draft").value = c.draftId || "";
    }
    preview();
  }
  async function companies() {
    field("company").replaceChildren();
    field("draft").replaceChildren();
    const office = field("office").value;
    if (!office) return;
    const rows = await service.listCompanies(office),
      c = workspace.context();
    picker.setRows(rows, c?.officeId === office ? c.companyId : "");
    await drafts();
  }
  function openChooser() {
    if (busy || dialog.open) return;
    dialog.showModal();
    run(async () => {
      status("Carregando empresas e preenchimentos…");
      const rows = await service.listOffices();
      field("office").replaceChildren(
        ...rows.map((row) => option(row.id, row.name)),
      );
      const c = workspace.context();
      if (c && rows.some((row) => row.id === c.officeId))
        field("office").value = c.officeId;
      await companies();
      status(
        rows.length
          ? "Selecione a empresa e o preenchimento acima."
          : "Nenhum escritório autorizado. Solicite acesso ao administrador.",
      );
    });
  }
  button.addEventListener("click", openChooser);
  current("open").addEventListener("click", openChooser);
  field("office").addEventListener("change", () => run(companies));
  field("draft").addEventListener("change", preview);
  field("open").addEventListener("click", () =>
    run(async () => {
      const s = selected();
      if (!s.companyId) throw Error("Selecione uma empresa.");
      if (
        !(await dialogs.confirm(
          "Abrir este preenchimento? Alterações ainda não enviadas permanecerão apenas neste navegador. Para compartilhá-las, cancele e use Salvar preenchimento.",
          {
            title: "Abrir preenchimento",
            confirmText: s.draftId ? "Abrir preenchimento" : "Usar empresa",
          },
        ))
      )
        return;
      let state,
        revision = null;
      if (s.draftId) {
        const row = await service.getDraft(s.officeId, s.companyId, s.draftId);
        if (row.schema_version !== 1)
          throw Error("Versão de preenchimento não suportada.");
        state = validateSnapshot(row.state);
        revision = row.revision;
      } else {
        state = workspace.cached({ ...s, revision: null });
        if (!state) {
          state = createDefaultState();
          state.colaboradores = [];
          state.proximoId = 1;
        }
      }
      workspace.activate({ ...s, revision }, state);
      window.location.reload();
    }),
  );
  async function save(asNew, title) {
    const c = activeContext();
    if (!asNew && unavailable)
      throw Error(
        "Este preenchimento não está mais disponível. Abra outro ou salve uma cópia.",
      );
    if (!titleKnown)
      throw Error(
        "Aguarde o nome atual ou informe um nome para confirmar o salvamento.",
      );
    if (asNew && workspace.pending())
      throw Error("Conclua o envio pendente antes de criar uma cópia.");
    const previous = workspace.pending();
    if (
      previous &&
      (previous.officeId !== c.officeId || previous.companyId !== c.companyId)
    )
      throw Error("O envio pendente não pertence à empresa aberta.");
    let body = previous;
    if (!body) {
      body = {
        ...c,
        draftId: asNew ? null : c.draftId,
        revision: asNew ? null : c.revision,
        key: window.crypto.randomUUID(),
        title: (title ?? field("title").value).trim(),
        state: validateSnapshot(app.state),
      };
      if (!body.title) throw Error("Informe o nome do preenchimento.");
      workspace.setPending(body);
    }
    status(
      previous
        ? "Confirmando o envio anterior sem duplicar…"
        : "Salvando o preenchimento na empresa…",
    );
    let result;
    try {
      result = await service.saveDraft(body);
    } catch (error) {
      if ([400, 403, 404, 409, 413].includes(error.status))
        workspace.clearPending();
      if (error.status === 404) {
        unavailable = true;
        throw Error(
          "O preenchimento foi excluído ou não está mais disponível. Use Salvar uma cópia para preservar os dados locais em outro registro.",
        );
      }
      if (error.status === 409)
        throw Error(
          "Outra pessoa alterou este preenchimento. Seus dados locais foram preservados. Abra a versão atual antes de salvar novamente.",
        );
      throw error;
    }
    workspace.activate(
      { ...c, draftId: result.id, revision: result.revision },
      app.state,
    );
    workspace.clearPending(c);
    contextKey = `${c.officeId}:${c.companyId}:${result.id}`;
    field("title").value = body.title;
    titleKnown = true;
    unavailable = false;
    dirty = JSON.stringify(body.state) !== JSON.stringify(app.state);
    if (selected().companyId === c.companyId) {
      const existing = [...field("draft").options].find(
        (o) => o.value === result.id,
      );
      if (existing)
        existing.textContent = `${body.title} · revisão ${result.revision}`;
      else
        field("draft").append(
          option(result.id, `${body.title} · revisão ${result.revision}`),
        );
      field("draft").value = result.id;
      preview();
    }
    status(
      dirty
        ? `Envio anterior salvo — revisão ${result.revision}. Há alterações locais posteriores; salve novamente para enviá-las.`
        : `Salvo no servidor — revisão ${result.revision}. Disponível aos usuários autorizados desta empresa.`,
    );
    updateButtons();
  }
  field("delete").addEventListener("click", () =>
    run(async () => {
      const target = selected(),
        row = loadedDrafts.get(target.draftId),
        active = workspace.context();
      if (!row) throw Error("Selecione um preenchimento salvo para excluir.");
      const isActive =
        active?.officeId === target.officeId &&
        active?.companyId === target.companyId &&
        active?.draftId === target.draftId;
      if (isActive && workspace.pending())
        throw Error(
          "Conclua o envio pendente antes de excluir este preenchimento.",
        );
      const company =
        field("company").selectedOptions[0]?.textContent ||
        "empresa selecionada";
      if (
        !(await dialogs.confirm(
          `Excluir “${row.title}” de ${company}?\n\nEle será removido da lista para todos os usuários desta empresa. Se estiver aberto, será fechado. Os demais preenchimentos não serão alterados; o histórico interno de auditoria será preservado.`,
          {
            title: "Excluir preenchimento",
            confirmText: "Excluir preenchimento",
            cancelText: "Manter preenchimento",
          },
        ))
      )
        return;
      let result;
      try {
        result = await service.deleteDraft({
          ...target,
          revision: row.revision,
        });
      } catch (error) {
        if (error.status === 409)
          throw Error(
            "Outra pessoa alterou o preenchimento. Reabra a janela para atualizar a lista antes de excluir.",
          );
        throw error;
      }
      if (result?.id !== target.draftId || result.deleted !== true)
        throw Error("O servidor não confirmou a exclusão. Tente novamente.");
      if (isActive) unavailable = true;
      loadedDrafts.delete(target.draftId);
      [...field("draft").options]
        .find((option) => option.value === target.draftId)
        ?.remove();
      try {
        workspace.forgetDraft(target);
      } catch {
        status(
          "Excluído no servidor. Não foi possível limpar a cópia local; recarregue a página para conferir.",
        );
        return;
      }
      if (isActive) {
        try {
          workspace.storage.setItem(
            "deleted-notice",
            `Preenchimento “${row.title}” excluído da empresa e fechado neste navegador.`,
          );
        } catch {
          /* A exclusão no servidor já foi confirmada. */
        }
        window.location.reload();
        return;
      }
      try {
        await drafts();
        status(
          `Preenchimento “${row.title}” excluído. Os demais foram preservados.`,
        );
      } catch {
        preview();
        status(
          "Preenchimento excluído no servidor. Reabra a janela para atualizar a lista.",
        );
      }
    }),
  );
  field("save").addEventListener("click", () => run(() => save(false)));
  field("new").addEventListener("click", () =>
    run(async () => {
      activeContext();
      if (workspace.pending())
        throw Error("Conclua o envio pendente antes de criar uma cópia.");
      const title = await dialogs.prompt(
        "A cópia será salva na mesma empresa e preservará o preenchimento original.",
        `${field("title").value || "Planejamento de escala"} — cópia`.slice(
          0,
          160,
        ),
        {
          title: "Salvar uma cópia",
          label: "Nome do novo preenchimento",
          confirmText: "Salvar cópia",
          maxLength: 160,
        },
      );
      if (title === null) return;
      await save(true, title);
    }),
  );
  field("restore").addEventListener("click", () =>
    run(async () => {
      const c = checkContext(),
        state = workspace.previous();
      if (!state)
        throw Error("Não há preenchimento local anterior para recuperar.");
      if (
        !(await dialogs.confirm(
          "Recuperar a cópia local anterior para conferir e mesclar? Nada será enviado ao servidor automaticamente.",
        ))
      )
        return;
      workspace.activate(c, state);
      window.location.reload();
    }),
  );
  field("import").addEventListener("click", () =>
    run(async () => {
      checkContext();
      const raw = workspace.legacy();
      if (!raw) throw Error("Não há dados antigos neste navegador.");
      if (
        !(await dialogs.confirm(
          "Importar o preenchimento antigo para esta empresa? Confira que ele pertence a ela. O original será preservado e nada será enviado ao servidor automaticamente.",
        ))
      )
        return;
      workspace.activate(
        workspace.context(),
        validateSnapshot(JSON.parse(raw)),
      );
      window.location.reload();
    }),
  );
  field("title").addEventListener("input", () => {
    dirty = true;
    titleKnown = true;
    updateButtons();
    current("status").textContent =
      "Nome alterado localmente. Use Salvar preenchimento para confirmar na empresa.";
  });
  window.addEventListener("cjs-local-save", () => {
    if (!workspace.context() || busy) return;
    dirty = true;
    current("status").textContent =
      "Alterações neste navegador. Use Salvar preenchimento para compartilhá-las com a equipe.";
  });
  window.addEventListener("cjs-company-changed", refreshCurrent);
  const observer = new window.ResizeObserver(() =>
    document.documentElement.style.setProperty(
      "--workspace-bar-height",
      `${bar.getBoundingClientRect().height ? bar.getBoundingClientRect().height + 28 : 0}px`,
    ),
  );
  observer.observe(bar);
  bar.dataset.loadingLabel = "Carregando empresa atual e preenchimento";
  bar.setAttribute("aria-busy", "true");
  try {
    await refreshCurrent();
    const notice = workspace.storage.getItem("deleted-notice");
    if (notice) {
      current("status").textContent = notice;
      workspace.storage.removeItem("deleted-notice");
    }
  } finally {
    bar.removeAttribute("aria-busy");
    bar.dataset.loadingLabel = "Salvando o preenchimento da empresa";
  }
}
