// Serviço preparado para o adaptador de autenticação individual. Não é ativado no fluxo local.
export function createRemotePersistence({ fetchImpl = fetch } = {}) {
  async function call(action, args = {}) {
    const response = await fetchImpl("/api/persistence", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, action }),
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(
        body.error || "Não foi possível salvar no servidor.",
      );
      error.status = response.status;
      throw error;
    }
    return body;
  }
  return {
    listOffices: () => call("listOffices"),
    listCompanies: (officeId) => call("listCompanies", { officeId }),
    listDrafts: (officeId, companyId) =>
      call("listDrafts", { officeId, companyId }),
    getDraft: (officeId, companyId, draftId) =>
      call("getDraft", { officeId, companyId, draftId }),
    saveDraft: (draft) => call("saveDraft", draft),
  };
}
