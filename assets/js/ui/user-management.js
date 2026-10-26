import { companyLabel, matchesCompany } from "../shared/empresas.js";
export function createUserManagement({ document, window }) {
  const root = document.getElementById("user-management");
  root.innerHTML = `<h2 data-management-title></h2><p data-management-description></p>
  <form id="manage-create" hidden>
  <label>Nome completo<input name="name" required maxlength="160" autocomplete="off"></label>
  <label>E-mail de acesso<input name="email" type="email" required maxlength="254" autocomplete="off"></label>
  <label>Senha inicial<input name="password" type="password" required minlength="6" maxlength="72" autocomplete="new-password"><small>Mínimo de 6 caracteres. Compartilhe a senha por um canal privado.</small></label>
  <label>Confirmar senha<input name="confirmation" type="password" required minlength="6" maxlength="72" autocomplete="new-password"></label>
  <label>Escritório<select name="officeId" required></select></label>
  <label>Perfil<select name="role"><option value="operator">Operador</option><option value="manager">Gerente</option></select></label>
  <p data-role-help></p><fieldset><legend>Empresas autorizadas</legend><label>Buscar por razão social ou CNPJ<input data-create-company-search type="search"></label><div class="management-companies" data-create-companies></div></fieldset>
  <button type="submit">Criar usuário</button></form>
  <form id="manage-access" hidden><label>Escritório<select name="officeId" required></select></label>
  <label>Operador<select name="userId" required></select></label>
  <fieldset><legend>Empresas autorizadas</legend><label>Buscar por razão social ou CNPJ<input data-access-company-search type="search"></label><div class="management-companies" data-access-companies></div></fieldset>
  <p>Desmarcar todas as empresas retira o acesso do operador aos rascunhos deste escritório. Os dados salvos no servidor são preservados.</p><button type="submit">Salvar acessos</button></form>
  <p data-management-status role="status" aria-live="polite"></p>`;
  const create = root.querySelector("#manage-create"),
    access = root.querySelector("#manage-access"),
    status = root.querySelector("[data-management-status]");
  let options,
    busy = false;
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
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    status.textContent = "Carregando…";
    try {
      await task();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      root.inert = false;
      root.removeAttribute("aria-busy");
      root.querySelectorAll("button").forEach((b) => (b.disabled = false));
      access.querySelector("button").disabled = !access.elements.userId.value;
    }
  }
  function checks(container, officeId, selected = [], all = false) {
    container.replaceChildren();
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
  for (const prefix of ["create", "access"]) {
    root
      .querySelector(`[data-${prefix}-company-search]`)
      .addEventListener("input", (event) => {
        root
          .querySelectorAll(`[data-${prefix}-companies] label`)
          .forEach((label) => {
            const row = options.companies.find(
              (c) => c.id === label.dataset.companyId,
            );
            label.hidden = !matchesCompany(row, event.target.value);
          });
      });
  }
  function createChecks() {
    root.querySelector("[data-create-company-search]").value = "";
    const role = create.elements.role.value;
    root.querySelector("[data-role-help]").textContent =
      role === "admin"
        ? "Admin tem acesso a todos os escritórios, empresas e à gestão de usuários."
        : role === "manager"
          ? "Gerente acessa todas as empresas deste escritório, cria usuários e gerencia os acessos dos operadores."
          : "Operador gera escalas somente para as empresas selecionadas.";
    checks(
      root.querySelector("[data-create-companies]"),
      create.elements.officeId.value,
      [],
      role !== "operator",
    );
  }
  function accessChecks() {
    root.querySelector("[data-access-company-search]").value = "";
    const user = options.users.find(
      (u) =>
        u.id === access.elements.userId.value &&
        u.officeId === access.elements.officeId.value,
    );
    checks(
      root.querySelector("[data-access-companies]"),
      access.elements.officeId.value,
      user?.companyIds || [],
    );
    access.querySelector("button").disabled = !user;
  }
  function operators() {
    access.elements.userId.replaceChildren(
      ...options.users
        .filter(
          (u) =>
            u.officeId === access.elements.officeId.value &&
            u.role === "operator",
        )
        .map((u) => new Option(u.name, u.id)),
    );
    accessChecks();
  }
  create.elements.officeId.addEventListener("change", createChecks);
  create.elements.role.addEventListener("change", createChecks);
  access.elements.officeId.addEventListener("change", operators);
  access.elements.userId.addEventListener("change", accessChecks);
  const selectedIds = (selector) =>
    [...root.querySelectorAll(`${selector} input:checked`)].map(
      (input) => input.value,
    );
  create.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const { confirmation, ...fields } = Object.fromEntries(
        new FormData(create),
      );
      if (fields.password !== confirmation)
        throw Error("As senhas não conferem.");
      const companyIds = selectedIds("[data-create-companies]");
      if (fields.role === "operator" && !companyIds.length)
        throw Error("Selecione ao menos uma empresa para o operador.");
      const result = await call({
        action: "createUser",
        ...fields,
        companyIds,
      });
      create.elements.password.value = "";
      create.elements.confirmation.value = "";
      status.textContent = `Usuário ${result.user.name} criado. Já pode entrar com o e-mail e a senha cadastrados.`;
    });
  });
  access.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      if (!access.elements.userId.value) throw Error("Selecione um operador.");
      const companyIds = selectedIds("[data-access-companies]");
      await call({
        action: "updateAccess",
        officeId: access.elements.officeId.value,
        userId: access.elements.userId.value,
        companyIds,
      });
      options.users.find(
        (u) =>
          u.id === access.elements.userId.value &&
          u.officeId === access.elements.officeId.value,
      ).companyIds = companyIds;
      status.textContent =
        "Acessos atualizados. A alteração já vale nas próximas consultas ao servidor.";
    });
  });
  return {
    show: (view) =>
      run(async () => {
        create.hidden = true;
        access.hidden = true;
        root.querySelector("[data-management-title]").textContent =
          view === "create" ? "Criar novo usuário" : "Acessos dos operadores";
        root.querySelector("[data-management-description]").textContent =
          "Gerencie os usuários e as empresas conforme suas permissões no escritório.";
        options = await call();
        for (const form of [create, access])
          form.elements.officeId.replaceChildren(
            ...options.offices.map((o) => new Option(o.name, o.id)),
          );
        create.elements.role.replaceChildren(
          new Option("Operador", "operator"),
          new Option("Gerente", "manager"),
          ...(options.platformAdmin ? [new Option("Admin", "admin")] : []),
        );
        createChecks();
        operators();
        create.hidden = view !== "create";
        access.hidden = view !== "access";
        status.textContent =
          view === "access" && !access.elements.userId.value
            ? "Nenhum operador cadastrado neste escritório."
            : "";
      }),
  };
}
