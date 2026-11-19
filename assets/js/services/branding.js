/** Cliente de /api/branding: marca do escritório usada nos relatórios. */
export function createBrandingService({ fetchImpl = fetch } = {}) {
  async function call(init, query = "") {
    let response;
    try {
      response = await fetchImpl("/api/branding" + query, { credentials: "same-origin", cache: "no-store", ...init });
    } catch {
      throw Error("Não foi possível conectar ao servidor. Tente novamente.");
    }
    let data;
    try { data = await response.json(); } catch { throw Error("O servidor não confirmou a operação. Tente novamente."); }
    if (!response.ok) throw Object.assign(Error(data.error || "Não foi possível concluir a operação."), { status: response.status });
    return data;
  }
  return {
    get: (officeId) => call({ method: "GET" }, "?" + new URLSearchParams({ officeId })),
    save: (marca) => call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(marca) }),
  };
}
