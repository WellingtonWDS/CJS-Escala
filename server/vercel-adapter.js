import { createRoutes } from "./routes.js";
export async function handleVercel(req, res, path) {
  let stage = "request-url";
  try {
    const origin = process.env.APP_ORIGIN || `https://${req.headers.host}`;
    const incoming = new URL(req.url || path, "http://local"),
      target = new URL(origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    stage = "request-construction";
    const request = new Request(target, {
      method: req.method,
      headers: req.headers,
      ...(req.method === "POST"
        ? {
            body:
              typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body ?? {}),
          }
        : {}),
    });
    stage = "route-handler";
    const response = await createRoutes({ env: process.env })(request);
    stage = "response-writing";
    res.statusCode = response?.status || 404;
    response?.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(response ? await response.text() : "Not found");
  } catch {
    // Não registrar a exceção original: URLs, cabeçalhos e corpos podem conter segredos.
    console.error("CJS_API_FAILURE", { route: path, stage });
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end("Serviço indisponível.");
  }
}
