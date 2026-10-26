import { createCompanyService } from "../services/companies.js";
import { createCompanyPicker } from "./company-picker.js";
import { validCnpj, formatCnpj } from "../shared/empresas.js";
export function createCompanyRegistry({
  document,
  window,
  service = createCompanyService(),
}) {
  const root = document.getElementById("company-management");
  root.dataset.loadingLabel = "Atualizando o cadastro da empresa";
  root.innerHTML = `<h2>Empresas</h2><p>Cadastre ou edite a razão social e o CNPJ. Alterações mantêm os rascunhos e acessos vinculados à mesma empresa.</p><h3 class="mt-5 font-semibold">Novo cadastro</h3>
  <form id="company-create"><label>Escritório<select name="officeId" required></select></label><label>Razão social<input name="name" maxlength="160" required></label><label>CNPJ<input name="cnpj" maxlength="18" required placeholder="00.000.000/0000-00" autocomplete="off"></label><button type="submit">Cadastrar empresa</button></form>
  <h3 class="mt-5 font-semibold">Empresas cadastradas</h3><label>Buscar por razão social ou CNPJ<input data-company-search type="search" placeholder="Digite o nome ou CNPJ"></label><label>Empresa<select data-company-list size="6"></select></label>
  <form id="company-edit" hidden><h3 class="font-semibold">Editar empresa selecionada</h3><label>Razão social<input name="name" required maxlength="160"></label><label>CNPJ<input name="cnpj" required maxlength="18"></label><p>O escritório e o identificador da empresa permanecem os mesmos. Os relatórios já importados mantêm seus dados históricos.</p><button type="submit">Salvar alterações da empresa</button></form>
  <p data-company-status role="status" aria-live="polite"></p>`;
  const form = root.querySelector("form"),
    status = root.querySelector("[role=status]");
  const edit = root.querySelector("#company-edit");
  let editing;
  const picker = createCompanyPicker({
    input: root.querySelector("[data-company-search]"),
    select: root.querySelector("[data-company-list]"),
    onChange: renderEdit,
  });
  let options,
    busy = false;
  const update = (
    selected = root.querySelector("[data-company-list]").value,
  ) => {
    picker.setRows(
      options.companies.filter(
        (c) => c.officeId === form.elements.officeId.value,
      ),
      selected,
    );
    renderEdit();
  };
  function renderEdit() {
    const row = options?.companies.find(
      (c) =>
        c.id === root.querySelector("[data-company-list]").value &&
        c.officeId === form.elements.officeId.value,
    );
    editing = row ? { ...row } : null;
    edit.hidden = !row;
    edit.elements.name.value = row?.name || "";
    edit.elements.cnpj.value = row?.cnpj ? formatCnpj(row.cnpj) : "";
  }
  async function load(selectedId) {
    const selected = form.elements.officeId.value;
    options = await service.options();
    const offices = options.offices.filter((o) => o.canCreate);
    form.elements.officeId.replaceChildren(
      ...offices.map((o) => new Option(o.name, o.id)),
    );
    if (offices.some((o) => o.id === selected))
      form.elements.officeId.value = selected;
    update(selectedId);
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    root.inert = true;
    root.setAttribute("aria-busy", "true");
    status.textContent = "Consultando cadastro…";
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
  form.elements.officeId.addEventListener("change", () => update(""));
  edit.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      if (!editing) throw Error("Selecione uma empresa.");
      const fields = Object.fromEntries(new FormData(edit));
      if (!validCnpj(fields.cnpj)) throw Error("Informe um CNPJ válido.");
      const result = await service.update({
        ...fields,
        officeId: editing.officeId,
        companyId: editing.id,
        previousName: editing.name,
        previousCnpj: editing.cnpj,
      });
      window.dispatchEvent(new Event("cjs-company-changed"));
      try {
        await load(result.company.id);
      } catch {
        status.textContent =
          "Alterações confirmadas no servidor. Reabra a seção para atualizar a lista.";
        return;
      }
      status.textContent = `Empresa atualizada: ${result.company.name} — ${formatCnpj(result.company.cnpj)}. Rascunhos e permissões foram preservados.`;
    });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const fields = Object.fromEntries(new FormData(form));
      if (!validCnpj(fields.cnpj))
        throw Error(
          "Informe um CNPJ válido, incluindo os dígitos verificadores.",
        );
      const result = await service.resolve(
        fields.officeId,
        fields.name,
        fields.cnpj,
        true,
      );
      window.dispatchEvent(new Event("cjs-company-changed"));
      try {
        await load();
      } catch {
        status.textContent =
          "Empresa confirmada no servidor, mas a lista não pôde ser atualizada. Reabra esta seção.";
        return;
      }
      status.textContent = `${result.status === "existing" ? "Empresa já cadastrada" : result.status === "updated" ? "CNPJ vinculado à empresa existente" : "Empresa cadastrada"}: ${result.company.name} — ${formatCnpj(result.company.cnpj)}.`;
    });
  });
  return {
    show: () =>
      run(async () => {
        await load();
        status.textContent = "";
      }),
  };
}
