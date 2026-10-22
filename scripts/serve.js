import { randomBytes } from "node:crypto";
import { guard, authResponse, SESSION_MS } from "../server/auth.js";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};
const developmentEnv = {
  ...process.env,
  AUTH_SESSION_SECRET:
    process.env.AUTH_SESSION_SECRET || randomBytes(32).toString("hex"),
};
export function createDevServer({
  root = projectRoot,
  auth = true,
  env = developmentEnv,
  now = Date.now,
} = {}) {
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const webRequest = new Request(requestUrl, {
        method: req.method,
        headers: req.headers,
        ...(req.method === "POST"
          ? {
              body: await new Promise((resolve, reject) => {
                let body = "";
                req.on("data", (chunk) => {
                  body += chunk;
                  if (body.length > 2048) {
                    reject(new Error("Body too large"));
                    req.destroy();
                  }
                });
                req.on("end", () => resolve(body));
                req.on("error", reject);
              }),
            }
          : {}),
      });
      let response;
      if (pathname === "/api/auth") {
        response = auth
          ? await authResponse(webRequest, env, now())
          : new Response(
              JSON.stringify({
                expiresAt: now() + SESSION_MS,
                serverNow: now(),
              }),
              { headers: { "Content-Type": "application/json" } },
            );
      } else if (auth) response = await guard(webRequest, env, now());
      if (response) {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (
        !["/", "/index.html", "/login.html"].includes(pathname) &&
        !pathname.startsWith("/assets/")
      ) {
        res.writeHead(404).end("Not found");
        return;
      }
      let file = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (
        !file.startsWith(resolve(root) + sep) ||
        pathname.split("/").some((part) => part.startsWith("."))
      ) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (
        resolve(root) === resolve(projectRoot) &&
        pathname === "/assets/vendor/xlsx.mjs"
      )
        file = resolve(projectRoot, "node_modules/@e965/xlsx/xlsx.mjs");
      if (!(await stat(file)).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3000);
  createDevServer().listen(port, "127.0.0.1", () =>
    console.log(`Servidor de desenvolvimento na porta ${port}`),
  );
}
