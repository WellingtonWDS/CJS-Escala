export function createDiagnosticsService({ fetchImpl = fetch } = {}) {
  async function call(action, fields = {}, post = false) {
    let response;
    try {
      response = await fetchImpl(
        post
          ? "/api/diagnostics"
          : "/api/diagnostics?" + new URLSearchParams({ action, ...fields }),
        {
          method: post ? "POST" : "GET",
          credentials: "same-origin",
          cache: "no-store",
          ...(post
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...fields }),
              }
            : {}),
        },
      );
    } catch {
      throw Error(
        "Não foi possível confirmar a operação. As respostas foram mantidas; use Repetir gravação pendente se o envio já tiver começado.",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error(
        "O servidor não confirmou o diagnóstico. Suas respostas continuam nesta tela.",
      );
    }
    if (!response.ok)
      throw Object.assign(
        Error(data.error || "Não foi possível consultar o diagnóstico."),
        { status: response.status },
      );
    return data;
  }
  return {
    options: () => call("options"),
    list: (fields) => call("list", fields),
    get: (fields) => call("get", fields),
    save: (fields) => call("save", fields, true),
  };
}
