export function initNavigation({ session, document, window, app, workspace, remote = null }) {
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
      home:
        '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-5h4v5"/>',
      schedule:
        '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
      workspace:
        '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
      diagnostics:
        '<path d="M9 4h6v3H9zM9 12h6M9 16h6"/><rect x="5" y="5" width="14" height="16" rx="2"/>',
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
  // Nome do usuário abre "Minha conta" (alterar senha) no login individual.
  const nomeUsuario = document.getElementById("sidebar-user");
  if (session.user.id && session.persistenceEnabled) {
    const conta = document.createElement("button");
    conta.type = "button";
    conta.className = "sidebar-conta";
    conta.dataset.minhaConta = "";
    conta.title = "Minha conta: alterar senha";
    conta.setAttribute("aria-haspopup", "dialog");
    conta.innerHTML = '<span class="sidebar-conta-nome"></span><span class="sidebar-conta-icone" aria-hidden="true">⚙</span>';
    conta.querySelector(".sidebar-conta-nome").textContent = session.user.name;
    conta.setAttribute("aria-label", `Minha conta — ${session.user.name}`);
    conta.addEventListener("click", async () => {
      const { openMinhaConta } = await import("./minha-conta.js");
      openMinhaConta({ document, window, user: session.user, returnFocus: conta });
    });
    nomeUsuario.replaceChildren(conta);
  } else nomeUsuario.textContent = session.user.name;
  document.getElementById("sidebar-role").textContent =
    { admin: "Admin", manager: "Gerente", operator: "Operador" }[role] ||
    "Operador";
  if (role === "admin" && session.persistenceEnabled) {
    // Painel de planos em página separada, exclusivo do Admin global (dados conferidos no servidor).
    // Junto ao papel, sem aumentar a altura do menu.
    const painel = document.createElement("a");
    painel.href = "/admin/";
    painel.className = "sidebar-admin-link";
    painel.textContent = "Painel Admin";
    document.getElementById("sidebar-role")?.append(" · ", painel);
  }
  const canManage = ["admin", "manager"].includes(role);
  const buttons = [...sidebar.querySelectorAll("[data-app-view]")];
  // Tela inicial "Empresas" somente com empresas no servidor.
  const hasHome = !!(session.persistenceEnabled && remote);
  buttons.forEach((button) => {
    if (button.dataset.appView === "home") button.hidden = !hasHome;
    else if (button.dataset.appView !== "schedule") button.hidden = !canManage;
  });
  let management,
    diagnosticRequest = null,
    home,
    diagnostics,
    generation = 0;
  async function show(view, homeOptions = {}) {
    if (
      [
        "user-management",
        "companies-home",
        "company-diagnostics",
      ].some(
        (id) =>
          document.getElementById(id).getAttribute("aria-busy") === "true",
      )
    )
      return;
    if (view === "home" && !hasHome) view = "schedule";
    // O diagnóstico só abre a partir do cartão da empresa.
    if (view === "diagnostics" && !diagnosticRequest) view = hasHome ? "home" : "schedule";
    if (!["schedule", "home"].includes(view) && !canManage) return;
    if (
      document.body.dataset.appView === "diagnostics" &&
      view !== "diagnostics" &&
      diagnostics &&
      !(await diagnostics.canLeave({ discard: true }))
    )
      return;
    const current = ++generation;
    document.getElementById("scheduler-view").hidden = view !== "schedule";
    document.getElementById("user-management").hidden = !["users"].includes(
      view,
    );
    document.getElementById("companies-home").hidden = view !== "home";
    document.getElementById("company-diagnostics").hidden =
      view !== "diagnostics";
    document.body.dataset.appView = view;
    buttons.forEach((b) =>
      b.dataset.appView === (view === "diagnostics" ? "home" : view)
        ? b.setAttribute("aria-current", "page")
        : b.removeAttribute("aria-current"),
    );
    // Endereço da tela: Empresas (#empresas) ou a etapa atual da escala, para manter a tela ao recarregar.
    if (view === "home" && window.location.hash !== "#empresas")
      window.history.replaceState(null, "", "#empresas");
    if (view === "schedule" && hasHome && !/^#sec-/.test(window.location.hash)) {
      const etapa = document.querySelector('[data-etapa-link][aria-current="step"]')?.dataset.etapaLink || "sec-config";
      window.history.replaceState(null, "", "#" + etapa);
    }
    if (view === "schedule") return;
    buttons.forEach((button) => (button.disabled = true));
    try {
      if (view === "diagnostics") {
        if (!diagnostics) {
          const { createCompanyDiagnostics } = await import(
            "./diagnostico-empresa.js"
          );
          diagnostics = createCompanyDiagnostics({
            document,
            window,
            app,
            workspace,
            onBack: (ctx) => show("home", ctx ? { companyId: ctx.companyId, officeId: ctx.officeId } : {}),
          });
        }
        const pedido = diagnosticRequest;
        diagnosticRequest = null;
        window.history.replaceState(null, "", "#diagnostico");
        // A troca de tela termina antes de carregar, para o carregamento não bloquear a navegação.
        window.setTimeout(() => diagnostics.open(pedido), 0);
        return;
      }
      if (view === "home") {
        if (!home) {
          const { createCompaniesHome } = await import("./empresas-home.js");
          home = createCompaniesHome({ document, window, session, workspace, remote, onOpened: () => show("schedule"),
            onDiagnostic: (ctx) => { diagnosticRequest = ctx; show("diagnostics"); } });
        }
        await home.show(homeOptions);
        return;
      }
      if (!management) {
        const { createUserManagement } = await import("./user-management.js");
        if (current !== generation) return;
        management = createUserManagement({ document, window });
      }
      await management.show(view);
    } catch {
      const target = document.getElementById(
        view === "diagnostics" ? "company-diagnostics" : view === "home" ? "companies-home" : "user-management",
      );
      target.textContent =
        "Não foi possível carregar esta seção. Recarregue a página.";
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  }
  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      show(button.dataset.appView);
    }),
  );
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#empresas" && document.body.dataset.appView !== "home") show("home");
    else if (/^#sec-/.test(window.location.hash) && document.body.dataset.appView === "home") show("schedule");
  });
  if (window.location.hash === "#usuarios" && canManage) show("users");
  else if (hasHome && ["", "#", "#empresas", "#diagnostico"].includes(window.location.hash)) show("home");
  return { show };
}
