import { compactarSnapshot, expandirSnapshot } from "../state/snapshot.js";
// Serviço preparado para o adaptador de autenticação individual. Não é ativado no fluxo local.
export function createRemotePersistence({ fetchImpl = fetch } = {}) {
  async function call(action, args = {}) {
    let response;
    try {
      response = await fetchImpl("/api/persistence", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, action }),
      });
    } catch {
      throw new Error(
        "Não foi possível conectar ao servidor. O envio pode ser repetido com a mesma chave.",
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(
        "O servidor não confirmou a operação. Tente repetir o envio.",
      );
    }
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
    getDraft: async (officeId, companyId, draftId) => {
      const row = await call("getDraft", { officeId, companyId, draftId });
      return row?.state ? {...row, state:expandirSnapshot(row.state)} : row;
    },
    saveDraft: (draft) => call("saveDraft", {...draft, state: compactarSnapshot(draft.state)}),
    deleteDraft: (draft) => call("deleteDraft", draft),
  };
}
