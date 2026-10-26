import { requireSession } from "./session.js";
import { getDialogs } from "./ui/dialogs.js";
const session = await requireSession();
if (session) {
  const { createApplication } = await import("./app.js");
  const env = {
    document,
    localStorage: {
      getItem: (...args) => window.localStorage.getItem(...args),
      setItem: (...args) => window.localStorage.setItem(...args),
      removeItem: (...args) => window.localStorage.removeItem(...args),
    },
    location,
    window,
    Blob,
    URL,
    ...getDialogs(document),
    setTimeout: (...args) => window.setTimeout(...args),
  };
  let workspace;
  if (session.user) {
    const { createWorkspace } = await import("./state/workspace.js");
    workspace = createWorkspace(window.localStorage, session.user.id);
    const context = workspace.context();
    if (context) {
      try {
        const { createRemotePersistence } = await import(
          "./services/persistence.js"
        );
        const companies = await createRemotePersistence().listCompanies(
          context.officeId,
        );
        if (!companies.some((c) => c.id === context.companyId))
          workspace.reset();
      } catch {
        document.body.innerHTML =
          "<main><p>Não foi possível conferir o acesso à empresa. Recarregue a página para tentar novamente.</p></main>";
        document.documentElement.style.visibility = "visible";
        throw Error("Acesso à empresa não confirmado.");
      }
    }
    env.localStorage = {
      ...workspace.storage,
      setItem: (...args) => {
        workspace.storage.setItem(...args);
        window.dispatchEvent(new Event("cjs-local-save"));
      },
    };
    env.beforeClearState = async () => {
      if (workspace.pending()) {
        await env.alert(
          "Há um envio pendente de confirmação. Resolva esse envio antes de limpar o preenchimento.",
        );
        return false;
      }
      return true;
    };
    document.getElementById("btn-limpar-dados").textContent =
      "Limpar preenchimento local";
    env.individual = true;
    env.preserveSavedPeriod = Boolean(workspace.context());
  }
  const app = createApplication({ env });
  app.bindEvents();
  app.init();
  if (session.persistenceEnabled && workspace) {
    const { createDominioCompanyResolver } = await import(
      "./ui/dominio-company.js"
    );
    env.resolveDominioImport = createDominioCompanyResolver({
      document,
      window,
      workspace,
      state: app.state,
    });
    document.getElementById("storage-description").textContent =
      "Preencha e salve rascunhos por empresa";
    const { initRemoteWorkspace } = await import("./ui/remote-workspace.js");
    await initRemoteWorkspace({ app, workspace, document, window });
  }
  if (session.user) {
    const { initNavigation } = await import("./ui/navigation.js");
    initNavigation({ session, document, window });
    document.querySelector("footer").textContent = session.persistenceEnabled
      ? "Salve seus rascunhos por empresa para mantê-los no servidor."
      : "Preenchimento salvo localmente neste navegador.";
  }
  document.documentElement.dataset.ready = "true";
  document.documentElement.style.visibility = "visible";
}
