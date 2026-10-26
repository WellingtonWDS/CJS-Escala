export function createCompanyService({ fetchImpl = fetch } = {}) {
  async function call(body) {
    const response = await fetchImpl("/api/companies", {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error(
        "O servidor não confirmou a operação de empresa. Tente novamente.",
      );
    }
    if (!response.ok)
      throw Object.assign(
        Error(data.error || "Não foi possível consultar a empresa."),
        { status: response.status },
      );
    return data;
  }
  return {
    options: () => call(),
    resolve: (officeId, name, cnpj, apply = false) =>
      call({ officeId, name, cnpj, apply }),
  };
}
