import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};
export function createDevServer({ root = projectRoot } = {}) {
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = resolve(
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
