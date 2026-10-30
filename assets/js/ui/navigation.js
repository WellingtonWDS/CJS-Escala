export function initNavigation({ session, document, window }) {
  const sidebar = document.getElementById("app-sidebar");
  sidebar.hidden = false;
  document.body.classList.add("has-app-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  function collapse(value) {
    document.body.classList.toggle("sidebar-collapsed", value);
    toggle.setAttribute("aria-expanded", String(!value));
    toggle.title = value ? "Expandir menu" : "Recolher menu";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.querySelector("span").textContent = toggle.title;
    try {
      window.localStorage.setItem("cjs-sidebar-collapsed", String(value));
    } catch {}
  }
  try {
    collapse(window.localStorage.getItem("cjs-sidebar-collapsed") === "true");
  } catch {}
  toggle.addEventListener("click", () =>
    collapse(!document.body.classList.contains("sidebar-collapsed")),
  );
  sidebar.querySelectorAll("nav button").forEach((button) => {
    const label = button.textContent;
    button.replaceChildren();
    const icon = document.createElement("span"),
      text = document.createElement("span");
    icon.className = "sidebar-icon";
    const paths = {
      schedule:
        '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
      workspace:
        '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
      companies:
        '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-5h4v5"/>',
      offices: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
      users:
        '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
    };
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[button.dataset.appView || "workspace"] || paths.workspace}</svg>`;
    icon.setAttribute("aria-hidden", "true");
    text.className = "sidebar-label";
    text.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon, text);
  });
  const logout = document.getElementById("btn-sair");
  logout.className = "sidebar-logout";
  logout.setAttribute("aria-label", "Sair");
  logout.title = "Sair";
  logout.innerHTML =
    '<span class="sidebar-icon" aria-hidden="true">↪</span><span class="sidebar-label">Sair</span>';
  const accountActions = document.createElement("div");
  accountActions.className = "sidebar-account-actions";
  accountActions.append(document.getElementById("btn-theme"), logout);
  sidebar.append(accountActions);
  const role = session.user.role || "operator";
  document.getElementById("sidebar-user").textContent = session.user.name;
  document.getElementById("sidebar-role").textContent =
    { admin: "Admin", manager: "Gerente", operator: "Operador" }[role] ||
    "Operador";
  const canManage = ["admin", "manager"].includes(role);
  const buttons = [...sidebar.querySelectorAll("[data-app-view]")];
  buttons.forEach((button) => {
    if (button.dataset.appView !== "schedule")
      button.hidden =
        button.dataset.appView === "offices" ? role !== "admin" : !canManage;
  });
  document.getElementById("sidebar-companies").hidden =
    !session.persistenceEnabled;
  document
    .getElementById("sidebar-companies")
    .addEventListener("click", () =>
      document.getElementById("btn-remote-workspace").click(),
    );
  let management,
    companies,
    offices,
    generation = 0;
  async function show(view) {
    if (
      ["user-management", "company-management", "office-management"].some(
        (id) =>
          document.getElementById(id).getAttribute("aria-busy") === "true",
      )
    )
      return;
    if (view !== "schedule" && !canManage) return;
    if (view === "offices" && role !== "admin") return;
    const current = ++generation;
    document.getElementById("scheduler-view").hidden = view !== "schedule";
    document.getElementById("user-management").hidden = !["users"].includes(
      view,
    );
    document.getElementById("company-management").hidden = view !== "companies";
    document.getElementById("office-management").hidden = view !== "offices";
    document.body.dataset.appView = view;
    buttons.forEach((b) =>
      b.dataset.appView === view
        ? b.setAttribute("aria-current", "page")
        : b.removeAttribute("aria-current"),
    );
    if (view === "schedule") return;
    buttons.forEach((button) => (button.disabled = true));
    try {
      if (view === "offices") {
        if (!offices) {
          const { createOfficeRegistry } = await import("./office-registry.js");
          offices = createOfficeRegistry({ document, window });
        }
        await offices.show();
        return;
      }
      if (view === "companies") {
        if (!companies) {
          const { createCompanyRegistry } = await import(
            "./company-registry.js"
          );
          companies = createCompanyRegistry({ document, window });
        }
        await companies.show();
        return;
      }
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
  if (window.location.hash === "#usuarios" && canManage) show("users");
}
