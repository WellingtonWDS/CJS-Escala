import { createCompanyService } from "../services/companies.js";
import { createCompanyPicker } from "./company-picker.js";
import { validCnpj, formatCnpj } from "../shared/empresas.js";
export function createCompanyRegistry({
  document,
  window,
  service = createCompanyService(),
}) {
  const root = document.getElementById("company-management");
  root.innerHTML = `<h2>Cadastrar empresas</h2><p>Informe a razão social e o CNPJ. O cadastro pertence ao escritório selecionado.</p>
  <form id="company-create"><label>Escritório<select name="officeId" required></select></label><label>Razão social<input name="name" maxlength="160" required></label><label>CNPJ<input name="cnpj" maxlength="18" required placeholder="00.000.000/0000-00" autocomplete="off"></label><button type="submit">Cadastrar empresa</button></form>
  <h3 class="mt-5 font-semibold">Empresas cadastradas</h3><label>Buscar por razão social ou CNPJ<input data-company-search type="search" placeholder="Digite o nome ou CNPJ"></label><label>Empresa<select data-company-list size="6"></select></label><p data-company-status role="status" aria-live="polite"></p>`;
  const form = root.querySelector("form"),
    status = root.querySelector("[role=status]");
  const picker = createCompanyPicker({
    input: root.querySelector("[data-company-search]"),
    select: root.querySelector("[data-company-list]"),
  });
  let options,
    busy = false;
  const update = () =>
    picker.setRows(
      options.companies.filter(
        (c) => c.officeId === form.elements.officeId.value,
      ),
    );
  async function load() {
    const selected = form.elements.officeId.value;
    options = await service.options();
    const offices = options.offices.filter((o) => o.canCreate);
    form.elements.officeId.replaceChildren(
      ...offices.map((o) => new Option(o.name, o.id)),
    );
    if (offices.some((o) => o.id === selected))
      form.elements.officeId.value = selected;
    update();
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
  form.elements.officeId.addEventListener("change", update);
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
