import { createDevServer } from "./serve.js";
import { configured } from "../server/auth.js";
import { fileURLToPath } from "node:url";
const env = process.env;
if (
  !configured(env) ||
  !env.APP_ORIGIN ||
  new URL(env.APP_ORIGIN).protocol !== "https:"
)
  throw Error(
    "Configure APP_ORIGIN HTTPS e AUTH_SESSION_SECRET antes de iniciar em produção.",
  );
const server = createDevServer({
  root: fileURLToPath(new URL("../dist/", import.meta.url)),
  env,
});
server.listen(Number(env.PORT || 3000), env.HOST || "127.0.0.1", () =>
  console.log("Aplicação iniciada atrás do proxy HTTPS."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
