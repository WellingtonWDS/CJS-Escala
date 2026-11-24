import { build } from "esbuild";
import { buildTheme } from "./build-theme.mjs";
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "login.html"), join(dist, "login.html"));
await cp(join(root, "redefinir-senha.html"), join(dist, "redefinir-senha.html"));
await cp(join(root, "confirmar-email.html"), join(dist, "confirmar-email.html"));
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
await cp(join(root, "logos"), join(dist, "logos"), { recursive: true });
await cp(join(root, "sobre"), join(dist, "sobre"), { recursive: true });
await cp(join(root, "admin"), join(dist, "admin"), { recursive: true });
await mkdir(join(dist, "assets/vendor"), { recursive: true });
// Fontes Inter e Space Grotesk servidas pelo próprio site (assets/css/fontes.css).
await mkdir(join(dist, "assets/fonts"), { recursive: true });
for (const [pacote, nome] of [["inter", "inter"], ["space-grotesk", "space-grotesk"]]) {
  for (const sub of ["latin", "latin-ext"])
    await cp(join(root, `node_modules/@fontsource-variable/${pacote}/files/${nome}-${sub}-wght-normal.woff2`), join(dist, `assets/fonts/${nome}-${sub}-wght-normal.woff2`));
  await cp(join(root, `node_modules/@fontsource-variable/${pacote}/LICENSE`), join(dist, `assets/fonts/LICENSE-${nome}.txt`));
}
await cp(
  join(root, "node_modules/@e965/xlsx/xlsx.mjs"),
  join(dist, "assets/vendor/xlsx.mjs"),
);
await cp(
  join(root, "node_modules/@e965/xlsx/LICENSE"),
  join(dist, "assets/vendor/LICENSE-xlsx.txt"),
);
// Leitor de PDF usado somente na importação do relatório da SCI.
for (const arquivo of ["pdf.min.mjs", "pdf.worker.min.mjs"])
  await cp(join(root, "node_modules/pdfjs-dist/build", arquivo), join(dist, "assets/vendor", arquivo));
await cp(join(root, "node_modules/pdfjs-dist/LICENSE"), join(dist, "assets/vendor/LICENSE-pdfjs.txt"));
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

// Produção: a tela principal carrega um pacote minificado (com divisão de código) em vez
// de ~100 módulos separados, e os estilos em um único arquivo. Os nomes têm hash para
// permitir cache longo (vercel.json). Os módulos originais continuam publicados: workers,
// páginas auxiliares e testes os importam diretamente. O pacote fica em assets/js/app/
// para que os caminhos relativos (../workers/, ../../vendor/) continuem válidos.
const pacote = await build({
  entryPoints: [join(root, "assets/js/main.js")],
  outdir: join(dist, "assets/js/app"),
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  target: "es2022",
  entryNames: "[name]-[hash]",
  chunkNames: "[name]-[hash]",
  external: ["/assets/vendor/*", "../../vendor/*", "../vendor/*"],
  metafile: true,
  legalComments: "none",
});
const principal = Object.entries(pacote.metafile.outputs).find(([, o]) => o.entryPoint === "assets/js/main.js")?.[0];
if (!principal) throw new Error("Pacote principal não gerado.");
let html = await readFile(join(dist, "index.html"), "utf8");
const origem = '<script type="module" src="./assets/js/main.js"></script>';
if (!html.includes(origem)) throw new Error("Entrada main.js não encontrada no index.html.");
html = html.replace(origem, `<script type="module" src="/${principal.replace(/^dist\//, "")}"></script>`);
// Estilos da página principal (mesma ordem) em um só arquivo.
const links = [...html.matchAll(/<link rel="stylesheet" href="(\.?\/assets\/css\/[^"?]+)(?:\?[^"]*)?">\n?/g)];
if (links.length) {
  const css = (await Promise.all(links.map((m) => readFile(join(dist, m[1].replace(/^\.?\//, "")), "utf8")))).join("\n");
  const nome = `app-${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`;
  await writeFile(join(dist, "assets/css", nome), css);
  html = html.replace(links[0][0], `<link rel="stylesheet" href="/assets/css/${nome}">\n`);
  for (const m of links.slice(1)) html = html.replace(m[0], "");
}
await writeFile(join(dist, "index.html"), html);
console.log(`Pacote principal: ${principal}`);
