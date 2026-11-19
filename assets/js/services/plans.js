/** Cliente de /api/plans: uso do plano, arquivamento e painel do Admin. */
export function createPlanService({ fetchImpl = fetch } = {}) {
  async function call(body, query) {
    let response;
    try {
      response = await fetchImpl(query ? `/api/plans?${new URLSearchParams(query)}` : "/api/plans", {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw Error("Não foi possível conferir o plano. Verifique a conexão e tente novamente.");
    }
    let data;
    try { data = await response.json(); } catch { throw Error("O servidor não confirmou a conferência do plano. Tente novamente."); }
    if (!response.ok) throw Object.assign(Error(data.error || "Não foi possível conferir o plano."), { status: response.status });
    return data;
  }
  return {
    use: ({ officeId, companyId, use, names, confirmSwap = false }) => call({ action: "use", officeId, companyId, use, names, confirmSwap }),
    status: (officeId) => call(null, { action: "status", officeId }),
    archive: (officeId, companyId, archived) => call({ action: "archive", officeId, companyId, archived }),
    overview: () => call(null, { action: "overview" }),
    detail: (officeId) => call(null, { action: "detail", officeId }),
    savePlan: (plan) => call({ action: "savePlan", ...plan }),
    removePlan: (officeId, revision) => call({ action: "removePlan", officeId, revision }),
    courtesy: (officeId, quantity, reason) => call({ action: "courtesy", officeId, quantity, reason }),
    setDemo: (officeId, demo) => call({ action: "demo", officeId, demo }),
  };
}
