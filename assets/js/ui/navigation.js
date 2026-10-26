export function initNavigation({ session, document, window }) {
  const sidebar = document.getElementById("app-sidebar");
  sidebar.hidden = false;
  document.body.classList.add("has-app-sidebar");
  const role = session.user.role || "operator";
  document.getElementById("sidebar-user").textContent = session.user.name;
  document.getElementById("sidebar-role").textContent =
    { admin: "Admin", manager: "Gerente", operator: "Operador" }[role] ||
    "Operador";
  const canManage = ["admin", "manager"].includes(role);
  const buttons = [...sidebar.querySelectorAll("[data-app-view]")];
  buttons.forEach((button) => {
    if (button.dataset.appView !== "schedule") button.hidden = !canManage;
  });
  document.getElementById("sidebar-companies").hidden =
    !session.persistenceEnabled;
  document
    .getElementById("sidebar-companies")
    .addEventListener("click", () =>
      document.getElementById("btn-remote-workspace").click(),
    );
  let management,
    generation = 0;
  async function show(view) {
    if (
      document.getElementById("user-management").getAttribute("aria-busy") ===
      "true"
    )
      return;
    if (view !== "schedule" && !canManage) return;
    const current = ++generation;
    document.getElementById("scheduler-view").hidden = view !== "schedule";
    document.getElementById("user-management").hidden = view === "schedule";
    document.body.dataset.appView = view;
    buttons.forEach((b) =>
      b.dataset.appView === view
        ? b.setAttribute("aria-current", "page")
        : b.removeAttribute("aria-current"),
    );
    if (view === "schedule") return;
    buttons.forEach((button) => (button.disabled = true));
    try {
      if (!management) {
        const { createUserManagement } = await import("./user-management.js");
        if (current !== generation) return;
        management = createUserManagement({ document, window });
      }
      await management.show(view);
    } catch {
      document.getElementById("user-management").textContent =
        "Não foi possível carregar a gestão de usuários. Recarregue a página.";
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  }
  buttons.forEach((button) =>
    button.addEventListener("click", () => show(button.dataset.appView)),
  );
  if (window.location.hash === "#usuarios" && canManage) show("create");
}
