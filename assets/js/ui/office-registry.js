import { createCompanyService } from "../services/companies.js";
export function createOfficeRegistry({
  document,
  window,
  service = createCompanyService(),
}) {
  const root = document.getElementById("office-management");
  root.innerHTML = `<h2>Escritórios</h2><p>Somente Admin pode criar novos escritórios. Depois, cadastre as empresas e os usuários do escritório.</p><form id="office-create"><label>Nome do escritório<input name="name" required maxlength="160"></label><button type="submit">Criar escritório</button></form><h3 class="mt-5 font-semibold">Escritórios cadastrados</h3><ul data-office-list></ul><p data-office-status role="status" aria-live="polite"></p>`;
  const form = root.querySelector("form"),
    status = root.querySelector("[role=status]"),
    list = root.querySelector("ul");
  let busy = false;
  async function load() {
    const options = await service.options();
    list.replaceChildren(
      ...options.offices.map((office) => {
        const li = document.createElement("li");
        li.textContent = office.name;
        return li;
      }),
    );
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const result = await service.createOffice(form.elements.name.value);
      window.dispatchEvent(new Event("cjs-company-changed"));
      try {
        await load();
      } catch {
        status.textContent =
          "Escritório confirmado no servidor. Reabra a seção para atualizar a lista.";
        return;
      }
      status.textContent = `${result.status === "existing" ? "Escritório já cadastrado" : "Escritório criado"}: ${result.office.name}.`;
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
