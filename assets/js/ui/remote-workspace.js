import { createCompanyPicker } from "./company-picker.js";
import { getDialogs } from "./dialogs.js";
import { createRemotePersistence } from "../services/persistence.js";
import { createDefaultState } from "../state/store.js";
import { validateSnapshot } from "../state/workspace.js";
import { escapeHtml as h } from "../shared/formatacao.js";
export async function initRemoteWorkspace({
  app,
  workspace,
  document,
  window,
  service = createRemotePersistence(),
}) {
  const dialogs = getDialogs(document);
  const button = document.getElementById("btn-remote-workspace"),
    dialog = document.getElementById("remote-workspace");
  button.hidden = false;
  dialog.dataset.loadingLabel = "Processando os rascunhos da empresa";
  dialog.innerHTML = `<form method="dialog"><button class="remote-close" aria-label="Fechar">×</button></form><h2>Empresas e rascunhos</h2><p>Abra uma empresa para começar ou recuperar um preenchimento. Os rascunhos salvos pertencem à empresa e ficam disponíveis aos usuários com acesso a ela, independentemente de quem os criou. Salvar no servidor é uma ação manual, inclusive após gerar a escala. “Salvar” atualiza o rascunho aberto, inclusive o título; “Salvar como novo” cria outro rascunho e preserva o anterior.</p><label>Escritório<select data-remote-office></select></label><label>Buscar empresa por razão social ou CNPJ<input data-remote-company-search type="search" placeholder="Digite a razão social ou CNPJ"></label><label>Empresa<select data-remote-company></select></label><label>Rascunhos desta empresa<select data-remote-draft></select></label><label>Título<input data-remote-title maxlength="160" value="Planejamento de escala"></label><div class="remote-actions"><button type="button" data-remote-open>Abrir seleção</button><button type="button" data-remote-save>Salvar</button><button type="button" data-remote-new>Salvar como novo</button><button type="button" data-remote-restore>Recuperar cópia local anterior</button><button type="button" data-remote-import>Importar dados antigos deste navegador</button></div><p data-remote-status role="status" aria-live="polite"></p><p class="text-xs">O histórico é preservado no servidor. Uma gravação conflitante exige reabrir a versão atual. Abrir outra seleção mantém o preenchimento anterior no cache local.</p>`;
  const field = (k) => dialog.querySelector(`[data-remote-${k}]`),
    status = (t) => (field("status").textContent = t);
  const picker = createCompanyPicker({
    input: field("company-search"),
    select: field("company"),
    onChange: () => run(drafts),
  });
  let busy = false,
    generation = 0;
  const selected = () => ({
    officeId: field("office").value,
    companyId: field("company").value,
    draftId: field("draft").value || null,
  });
  function checkContext() {
    const s = selected(),
      c = workspace.context();
    if (
      !c ||
      c.officeId !== s.officeId ||
      c.companyId !== s.companyId ||
      c.draftId !== s.draftId
    )
      throw Error("Abra esta seleção antes de salvar.");
    return c;
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    dialog.setAttribute("aria-busy", "true");
    dialog
      .querySelectorAll("select,input,.remote-actions button")
      .forEach((e) => (e.disabled = true));
    try {
      await task();
    } catch (e) {
      status(
        e.status === 401
          ? "A sessão expirou. Entre novamente."
          : e.message || "Não foi possível concluir a operação.",
      );
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
      dialog
        .querySelectorAll("select,input,.remote-actions button")
        .forEach((e) => (e.disabled = false));
    }
  }
  const option = (value, label) =>
    `<option value="${h(value)}">${h(label)}</option>`;
  async function drafts() {
    const id = ++generation,
      s = selected();
    field("draft").innerHTML = option("", "Novo preenchimento");
    if (!s.officeId || !s.companyId) return;
    const rows = await service.listDrafts(s.officeId, s.companyId);
    if (id !== generation) return;
    field("draft").innerHTML += rows
      .map((r) => option(r.id, `${r.title} · revisão ${r.revision}`))
      .join("");
    const c = workspace.context();
    if (c?.officeId === s.officeId && c?.companyId === s.companyId) {
      if (c.draftId && !rows.some((r) => r.id === c.draftId)) {
        const current = await service.getDraft(
          c.officeId,
          c.companyId,
          c.draftId,
        );
        rows.push(current);
        field("draft").innerHTML += option(
          current.id,
          `${current.title} · revisão ${current.revision}`,
        );
      }
      field("draft").value = c.draftId || "";
    }
    const updateTitle = () => {
      const row = rows.find((r) => r.id === field("draft").value);
      field("title").value = row?.title || "Planejamento de escala";
    };
    field("draft").onchange = updateTitle;
    updateTitle();
  }
  async function companies() {
    const office = field("office").value;
    field("company").innerHTML = "";
    field("draft").innerHTML = "";
    if (!office) return;
    const rows = await service.listCompanies(office);
    const c = workspace.context();
    picker.setRows(rows, c?.officeId === office ? c.companyId : "");
    await drafts();
  }
  button.addEventListener("click", () => {
    dialog.showModal();
    run(async () => {
      status("Carregando empresas autorizadas…");
      const rows = await service.listOffices();
      field("office").innerHTML = rows
        .map((r) => option(r.id, r.name))
        .join("");
      const c = workspace.context();
      if (c && rows.some((r) => r.id === c.officeId))
        field("office").value = c.officeId;
      await companies();
      status(
        rows.length
          ? "Escolha a empresa e abra o rascunho ou um novo preenchimento."
          : "Nenhum escritório autorizado. Solicite acesso ao administrador.",
      );
    });
  });
  field("office").addEventListener("change", () => run(companies));
  field("open").addEventListener("click", () =>
    run(async () => {
      const s = selected();
      if (!s.companyId) throw Error("Selecione uma empresa.");
      if (
        !(await dialogs.confirm(
          "Abrir esta seleção? O preenchimento atual continuará salvo apenas no cache deste navegador até ser enviado ao servidor.",
        ))
      )
        return;
      let state,
        revision = null;
      if (s.draftId) {
        const row = await service.getDraft(s.officeId, s.companyId, s.draftId);
        if (row.schema_version !== 1)
          throw Error("Versão de rascunho não suportada.");
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
  async function save(asNew) {
    const c = checkContext();
    if (asNew && workspace.pending())
      throw Error("Conclua o envio pendente antes de criar outro rascunho.");
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
        title: field("title").value.trim(),
        state: validateSnapshot(app.state),
      };
      if (!body.title) throw Error("Informe um título.");
      workspace.setPending(body);
    }
    status(
      previous
        ? "Repetindo o envio anterior sem duplicar a gravação…"
        : "Salvando no servidor…",
    );
    let result;
    try {
      result = await service.saveDraft(body);
    } catch (e) {
      if ([400, 403, 404, 409, 413].includes(e.status))
        workspace.clearPending();
      if (e.status === 409)
        throw Error(
          "Outra pessoa alterou o rascunho. Seu preenchimento local foi preservado; reabra a versão atual para comparar antes de salvar.",
        );
      throw e;
    }
    workspace.activate(
      { ...c, draftId: result.id, revision: result.revision },
      app.state,
    );
    workspace.clearPending(c);
    field("title").value = body.title;
    field("draft").innerHTML = option(
      result.id,
      `${body.title} · revisão ${result.revision}`,
    );
    field("draft").value = result.id;
    let refreshFailed = false;
    try {
      await drafts();
    } catch {
      // A gravação já foi confirmada; falhar ao listar não a desfaz.
      refreshFailed = true;
      field("draft").innerHTML = option(
        result.id,
        `${body.title} · revisão ${result.revision}`,
      );
      field("draft").value = result.id;
    }
    status(
      JSON.stringify(body.state) === JSON.stringify(app.state)
        ? `Salvo no servidor — revisão ${result.revision}.${refreshFailed ? " Não foi possível atualizar a lista; reabra a página para tentar novamente." : ""}`
        : `Envio anterior salvo — revisão ${result.revision}. Há alterações locais posteriores; salve novamente para enviá-las.`,
    );
  }
  field("save").addEventListener("click", () => run(() => save(false)));
  field("new").addEventListener("click", () => run(() => save(true)));
  field("restore").addEventListener("click", () =>
    run(async () => {
      const c = checkContext(),
        state = workspace.previous();
      if (!state) throw Error("Não há cópia local anterior para esta seleção.");
      if (
        !(await dialogs.confirm(
          "Recuperar o preenchimento local anterior para conferir e mesclar? Nada será enviado ao servidor. A revisão atual será mantida e o conteúdo aberto ficará guardado como cópia anterior.",
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
      const state = validateSnapshot(JSON.parse(raw));
      workspace.activate(workspace.context(), state);
      window.location.reload();
    }),
  );
}
