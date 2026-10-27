import {
  companyLabel,
  matchesCompany,
  searchText,
} from "../shared/empresas.js";
import { getDialogs } from "./dialogs.js";
export function createUserManagement({ document, window }) {
  const root = document.getElementById("user-management"),
    dialogs = getDialogs(document);
  root.dataset.loadingLabel = "Atualizando usuários e permissões";
  root.innerHTML = `<div class="users-heading"><div><h2>Usuários</h2><p>Consulte os cadastros e gerencie os acessos conforme suas permissões.</p></div><button type="button" data-user-new disabled>Novo usuário</button></div>
  <div class="users-filters"><label>Pesquisar usuários<input data-users-search type="search" placeholder="Nome, e-mail ou escritório"></label><label>Escritório<select data-users-office><option value="">Todos os escritórios</option></select></label><button type="button" data-users-refresh>Atualizar lista</button></div>
  <p data-management-status role="status" aria-live="polite"></p><p data-users-count></p><div class="users-list" data-users-list></div>
  <section class="user-editor" data-user-editor hidden><h3 data-editor-title></h3>
  <form id="manage-create" hidden><label>Nome completo<input name="name" required maxlength="160" autocomplete="off"></label><label>E-mail de acesso<input name="email" type="email" required maxlength="254" autocomplete="off"></label><label>Senha inicial<input name="password" type="password" required minlength="6" maxlength="72" autocomplete="new-password"><small>Mínimo de 6 caracteres. Compartilhe por um canal privado.</small></label><label>Confirmar senha<input name="confirmation" type="password" required minlength="6" maxlength="72" autocomplete="new-password"></label><label>Escritório<select name="officeId" required></select></label><label>Perfil<select name="role"></select></label><p data-create-role-help></p><fieldset><legend>Empresas autorizadas</legend><label>Buscar empresas<input data-create-company-search type="search" placeholder="Razão social ou CNPJ"></label><div class="management-companies" data-create-companies></div></fieldset><div class="users-form-actions"><button type="submit">Criar usuário</button><button type="button" data-user-cancel>Cancelar</button></div></form>
  <form id="manage-edit" hidden><p data-edit-office></p><label>Nome completo<input name="name" required maxlength="160" autocomplete="off"></label><label>E-mail de acesso<input name="email" type="email" required maxlength="254" autocomplete="off"></label><p data-identity-help></p><label>Perfil<select name="role"></select></label><label class="user-toggle"><input type="checkbox" role="switch" name="active"><span>Acesso ativo neste escritório</span></label><label class="user-toggle" data-account-toggle><input type="checkbox" role="switch" name="accountActive"><span>Conta ativa em todo o sistema</span></label><p data-edit-role-help></p><fieldset><legend>Empresas autorizadas</legend><label>Buscar empresas<input data-edit-company-search type="search" placeholder="Razão social ou CNPJ"></label><div class="management-companies" data-edit-companies></div></fieldset><p>A inativação no escritório preserva os preenchimentos e os vínculos de outros escritórios. Inativar a conta inteira revoga suas sessões.</p><div class="users-form-actions"><button type="submit">Salvar alterações</button><button type="button" data-user-cancel>Cancelar</button></div></form></section>`;
  const create = root.querySelector("#manage-create"),
    edit = root.querySelector("#manage-edit"),
    status = root.querySelector("[data-management-status]"),
    field = (name) => root.querySelector(`[data-${name}]`);
  let options,
    busy = false,
    editing;
  const officeName = (id) =>
    options.offices.find((o) => o.id === id)?.name ||
    "Sem vínculo com escritório";
  const roleName = {
    admin: "Admin",
    manager: "Gerente",
    operator: "Operador",
    viewer: "Consulta (legado)",
  };
  async function call(body) {
    const response = await window.fetch("/api/admin", {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error("Gestão de usuários indisponível.");
    }
    if (!response.ok)
      throw Error(data.error || "Não foi possível concluir a operação.");
    return data;
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    root.inert = true;
    root.setAttribute("aria-busy", "true");
    status.textContent = "Carregando…";
    try {
      await task();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      root.inert = false;
      root.removeAttribute("aria-busy");
    }
  }
  function closeEditor() {
    field("user-editor").hidden = true;
    create.hidden = true;
    edit.hidden = true;
    editing = null;
    create.elements.password.value = "";
    create.elements.confirmation.value = "";
  }
  function checks(prefix, officeId, selected = [], all = false) {
    const container = field(`${prefix}-companies`);
    container.replaceChildren();
    field(`${prefix}-company-search`).value = "";
    for (const company of options.companies.filter(
      (c) => c.officeId === officeId,
    )) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.value = company.id;
      input.checked = all || selected.includes(company.id);
      input.disabled = all;
      label.dataset.companyId = company.id;
      label.append(input, document.createTextNode(companyLabel(company)));
      container.append(label);
    }
    if (!container.children.length)
      container.textContent = "Não há empresas cadastradas neste escritório.";
  }
  const selectedIds = (prefix) =>
    [...field(`${prefix}-companies`).querySelectorAll("input:checked")].map(
      (input) => input.value,
    );
  function roleHelp(prefix) {
    const form = prefix === "create" ? create : edit,
      role = form.elements.role.value;
    field(`${prefix}-role-help`).textContent =
      role === "admin"
        ? "Admin acessa todos os escritórios e funcionalidades."
        : role === "manager"
          ? "Gerente acessa todas as empresas deste escritório e gerencia seus usuários."
          : role === "viewer"
            ? "Consulta legada: pode abrir, mas não salvar preenchimentos."
            : "Operador gera escalas nas empresas selecionadas. Desmarcar todas retira o acesso às empresas deste escritório.";
  }
  function roles(select, selected = "operator") {
    select.replaceChildren(
      new Option("Operador", "operator"),
      new Option("Gerente", "manager"),
      ...(options.platformAdmin ? [new Option("Admin", "admin")] : []),
      ...(selected === "viewer"
        ? [new Option("Consulta (legado)", "viewer")]
        : []),
    );
    select.value = selected;
  }
  function payload(row) {
    return {
      action: "updateUser",
      userId: row.id,
      officeId: row.officeId,
      revision: row.revision,
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.membershipActive,
      accountActive: row.accountActive,
      companyIds: row.companyIds,
    };
  }
  async function reload(message = "") {
    options = await call();
    const filter = field("users-office"),
      previous = filter.value;
    filter.replaceChildren(
      new Option("Todos os escritórios", ""),
      ...options.offices.map((o) => new Option(o.name, o.id)),
    );
    filter.value = options.offices.some((o) => o.id === previous)
      ? previous
      : "";
    field("user-new").disabled = !options.offices.some((o) => o.active);
    render();
    status.textContent = message;
  }
  async function saved(message) {
    closeEditor();
    try {
      await reload(message);
    } catch {
      status.textContent = `${message} Não foi possível atualizar a lista; use Atualizar lista antes de editar novamente.`;
    }
  }
  function render() {
    if (!options) return;
    const term = searchText(field("users-search").value).trim(),
      office = field("users-office").value;
    const rows = options.users.filter(
      (u) =>
        (!office || u.officeId === office) &&
        (!term ||
          searchText(
            `${u.name} ${u.email || ""} ${officeName(u.officeId)}`,
          ).includes(term)),
    );
    const list = field("users-list");
    list.replaceChildren();
    field("users-count").textContent =
      `${rows.length} cadastro(s) encontrado(s). Contas com mais de um escritório aparecem por vínculo.`;
    for (const user of rows) {
      const card = document.createElement("article");
      card.className = "user-row";
      card.dataset.userId = user.id;
      card.dataset.officeId = user.officeId || "";
      const info = document.createElement("div"),
        name = document.createElement("strong"),
        email = document.createElement("span"),
        officeLabel = document.createElement("span");
      name.textContent = user.name;
      email.textContent = user.email || "E-mail não disponível";
      officeLabel.textContent = `${officeName(user.officeId)} · ${roleName[user.role]}`;
      info.append(name, email, officeLabel);
      const actions = document.createElement("div");
      actions.className = "user-row-actions";
      const label = document.createElement("label"),
        toggle = document.createElement("input"),
        text = document.createElement("span");
      label.className = "user-toggle";
      toggle.type = "checkbox";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-label", `Acesso de ${user.name}`);
      toggle.checked = user.active;
      toggle.disabled =
        !user.canEdit ||
        user.id === options.currentUserId ||
        (!user.officeId && user.role !== "admin") ||
        (!user.accountActive && user.role !== "admin" && !!user.officeId);
      text.textContent = user.active
        ? "Ativo"
        : !user.accountActive
          ? "Conta inativa"
          : "Inativo";
      label.append(toggle, text);
      toggle.addEventListener("change", () => {
        toggle.checked = user.active;
        run(async () => {
          const global = user.role === "admin" || !user.officeId;
          if (
            user.active &&
            !(await dialogs.confirm(
              global
                ? `Inativar a conta de ${user.name}? Suas sessões serão revogadas em todo o sistema.`
                : `Inativar ${user.name} em ${officeName(user.officeId)}? Os preenchimentos serão preservados.`,
              { title: "Inativar usuário", confirmText: "Inativar" },
            ))
          ) {
            status.textContent = "Inativação cancelada.";
            return;
          }
          const body = payload(user);
          if (global) body.accountActive = !user.active;
          else body.active = !user.active;
          await call(body);
          await saved("Situação do usuário atualizada.");
        });
      });
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Editar";
      button.dataset.userEdit = "";
      button.disabled = !user.canEdit;
      button.addEventListener("click", () => openEdit(user));
      actions.append(label, button);
      card.append(info, actions);
      list.append(card);
    }
    if (!rows.length)
      list.textContent = "Nenhum usuário encontrado para esta pesquisa.";
  }
  function openEdit(user) {
    closeEditor();
    editing = user;
    create.hidden = true;
    edit.hidden = false;
    field("user-editor").hidden = false;
    field("editor-title").textContent = `Editar ${user.name}`;
    field("edit-office").textContent = officeName(user.officeId);
    edit.elements.name.value = user.name;
    edit.elements.email.value = user.email || "";
    edit.elements.name.readOnly = !user.canEditIdentity;
    edit.elements.email.disabled = !user.canEditIdentity || user.email === null;
    field("identity-help").textContent = !user.canEditIdentity
      ? "Conta vinculada a outros escritórios. Somente o Admin pode alterar nome e e-mail."
      : user.email === null
        ? "Identidade externa sem e-mail disponível para edição. A senha não será alterada."
        : "Nome e e-mail atualizam o cadastro de acesso. A senha permanece a mesma.";
    roles(edit.elements.role, user.role);
    edit.elements.role.disabled =
      user.id === options.currentUserId || !user.officeId;
    edit.elements.active.checked = user.membershipActive;
    edit.elements.active.disabled = user.id === options.currentUserId;
    edit.elements.active.closest("label").hidden =
      user.role === "admin" || !user.officeId;
    edit.elements.accountActive.checked = user.accountActive;
    edit.elements.accountActive.disabled = user.id === options.currentUserId;
    field("account-toggle").hidden = !options.platformAdmin;
    checks(
      "edit",
      user.officeId,
      user.companyIds,
      ["admin", "manager"].includes(user.role),
    );
    roleHelp("edit");
    edit.elements.name.focus();
    field("user-editor").scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }
  field("user-new").addEventListener("click", () => {
    if (!options) return;
    closeEditor();
    create.reset();
    create.hidden = false;
    field("user-editor").hidden = false;
    field("editor-title").textContent = "Novo usuário";
    create.elements.officeId.replaceChildren(
      ...options.offices
        .filter((o) => o.active)
        .map((o) => new Option(o.name, o.id)),
    );
    roles(create.elements.role);
    checks("create", create.elements.officeId.value);
    roleHelp("create");
    create.elements.name.focus();
    field("user-editor").scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  });
  root
    .querySelectorAll("[data-user-cancel]")
    .forEach((button) => button.addEventListener("click", closeEditor));
  field("users-search").addEventListener("input", render);
  field("users-office").addEventListener("change", render);
  field("users-refresh").addEventListener("click", () =>
    run(async () => {
      closeEditor();
      await reload("Lista atualizada.");
    }),
  );
  for (const prefix of ["create", "edit"]) {
    field(`${prefix}-company-search`).addEventListener("input", (event) =>
      field(`${prefix}-companies`)
        .querySelectorAll("label")
        .forEach((label) => {
          label.hidden = !matchesCompany(
            options.companies.find((c) => c.id === label.dataset.companyId),
            event.target.value,
          );
        }),
    );
    const form = prefix === "create" ? create : edit;
    form.elements.role.addEventListener("change", () => {
      checks(
        prefix,
        prefix === "create" ? form.elements.officeId.value : editing.officeId,
        editing?.companyIds || [],
        ["admin", "manager"].includes(form.elements.role.value),
      );
      if (prefix === "edit")
        edit.elements.active.closest("label").hidden =
          form.elements.role.value === "admin" || !editing.officeId;
      roleHelp(prefix);
    });
  }
  create.elements.officeId.addEventListener("change", () => {
    checks(
      "create",
      create.elements.officeId.value,
      [],
      ["admin", "manager"].includes(create.elements.role.value),
    );
  });
  create.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const { confirmation, ...fields } = Object.fromEntries(
        new FormData(create),
      );
      if (fields.password !== confirmation)
        throw Error("As senhas não conferem.");
      const companyIds = selectedIds("create");
      if (fields.role === "operator" && !companyIds.length)
        throw Error("Selecione ao menos uma empresa para o operador.");
      const result = await call({
        action: "createUser",
        ...fields,
        companyIds,
      });
      await saved(
        `Usuário ${result.user.name} criado. Já pode entrar com o e-mail e a senha cadastrados.`,
      );
    });
  });
  edit.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      if (!editing) return;
      const body = {
        ...payload(editing),
        name: edit.elements.name.value,
        email: editing.email === null ? null : edit.elements.email.value,
        role: edit.elements.role.value,
        active: edit.elements.active.checked,
        accountActive: edit.elements.accountActive.checked,
        companyIds: selectedIds("edit"),
      };
      if (
        (editing.membershipActive && !body.active) ||
        (editing.accountActive && !body.accountActive)
      )
        if (
          !(await dialogs.confirm(
            "Salvar a inativação deste usuário? Os preenchimentos existentes serão preservados.",
            { title: "Inativar usuário", confirmText: "Salvar e inativar" },
          ))
        ) {
          status.textContent = "Alteração cancelada.";
          return;
        }
      await call(body);
      await saved(
        "Usuário e acessos atualizados. As permissões já valem nas próximas consultas ao servidor.",
      );
    });
  });
  return {
    show: () =>
      run(async () => {
        closeEditor();
        options = null;
        field("users-list").replaceChildren();
        field("user-new").disabled = true;
        await reload();
      }),
  };
}
