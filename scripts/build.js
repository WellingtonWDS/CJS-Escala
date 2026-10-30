import { build } from "esbuild";
import { buildTheme } from "./build-theme.mjs";
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "login.html"), join(dist, "login.html"));
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
await cp(join(root, "logos"), join(dist, "logos"), { recursive: true });
await mkdir(join(dist, "assets/vendor"), { recursive: true });
await cp(
  join(root, "node_modules/@e965/xlsx/xlsx.mjs"),
  join(dist, "assets/vendor/xlsx.mjs"),
);
await cp(
  join(root, "node_modules/@e965/xlsx/LICENSE"),
  join(dist, "assets/vendor/LICENSE-xlsx.txt"),
);
execFileSync(
  process.execPath,
  [
    join(root, "node_modules/tailwindcss/lib/cli.js"),
    "--config",
    join(root, "tailwind.config.cjs"),
    "--input",
    join(root, "assets/css/utilities-source.css"),
    "--output",
    join(root, "assets/css/utilities.css"),
    "--minify",
  ],
  { cwd: root, stdio: "inherit" },
);
await cp(
  join(root, "assets/css/utilities.css"),
  join(dist, "assets/css/utilities.css"),
);
await buildTheme(root);
await cp(join(root, "assets/css/theme-dark.css"), join(dist, "assets/css/theme-dark.css"));
console.log("Publicação estática preparada em dist/.");

await build({
  entryPoints: [join(root, "assets/js/export/pdf-vendor.js")],
  outfile: join(dist, "assets/vendor/pdf.js"),
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "eof",
});
