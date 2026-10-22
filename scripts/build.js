import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
await mkdir(join(dist, "assets/vendor"), { recursive: true });
await cp(
  join(root, "node_modules/@e965/xlsx/xlsx.mjs"),
  join(dist, "assets/vendor/xlsx.mjs"),
);
await cp(
  join(root, "node_modules/@e965/xlsx/LICENSE"),
  join(dist, "assets/vendor/LICENSE-xlsx.txt"),
);
console.log("Publicação estática preparada em dist/.");
