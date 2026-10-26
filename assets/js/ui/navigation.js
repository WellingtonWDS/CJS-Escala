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
  sidebar.querySelectorAll("nav button").forEach((button, i) => {
    const label = button.textContent;
    button.replaceChildren();
    const icon = document.createElement("span"),
      text = document.createElement("span");
    icon.className = "sidebar-icon";
    icon.textContent = ["▦", "▤", "+", "♙", "⚿"][i] || "•";
    icon.setAttribute("aria-hidden", "true");
    text.className = "sidebar-label";
    text.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(icon, text);
  });
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
    document.getElementById("user-management").hidden = ![
      "create",
      "access",
    ].includes(view);
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
  if (window.location.hash === "#usuarios" && canManage) show("create");
}
