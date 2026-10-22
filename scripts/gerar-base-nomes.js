import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const COMMIT = "ea0678d8e410c44fb6c72324feadfec486bd555b";
const root = fileURLToPath(new URL("../", import.meta.url));
const pasta = process.argv
  .find((a) => a.startsWith("--source-dir="))
  ?.slice(13);
const dados = new Map(),
  hashes = {};
for (const [arquivo, indice, sexo] of [
  ["ibge-fem-10000.csv", 0, "F"],
  ["ibge-mas-10000.csv", 1, "M"],
]) {
  const url = `https://raw.githubusercontent.com/MedidaSP/nomes-brasileiros-ibge/${COMMIT}/${arquivo}`;
  const bytes = pasta
    ? await readFile(join(pasta, arquivo))
    : Buffer.from(await (await fetch(url)).arrayBuffer());
  hashes[arquivo] = createHash("sha256").update(bytes).digest("hex");
  const linhas = bytes.toString("utf8").trim().split(/\r?\n/);
  if (linhas.shift() !== '"nome","regiao","freq","rank","sexo"')
    throw new Error("Cabeçalho da fonte mudou.");
  for (const linha of linhas) {
    const m = linha.match(/^"([A-Z]+)",0,(\d+),(\d+),"([FM])"$/);
    if (!m || m[4] !== sexo) throw new Error("Linha da fonte inválida.");
    const contagens = dados.get(m[1]) || [null, null];
    if (contagens[indice] !== null) throw new Error("Nome duplicado na fonte.");
    contagens[indice] = Number(m[2]);
    dados.set(m[1], contagens);
  }
}
// Ausência em uma lista truncada não equivale a frequência zero.
const pareados = Object.fromEntries(
  [...dados]
    .filter(([, c]) => c.every((v) => Number.isSafeInteger(v) && v > 0))
    .sort(([a], [b]) => a.localeCompare(b, "en")),
);
const texto = `// Gerado por scripts/gerar-base-nomes.js. Fonte e limites: FONTES-NOMES.md.\nexport const NOMES_IBGE = Object.freeze(${JSON.stringify(pareados)});\n`;
await mkdir(join(root, "assets/js/data"), { recursive: true });
await writeFile(join(root, "assets/js/data/nomes-ibge.js"), texto);
await writeFile(
  join(root, "assets/js/data/nomes-ibge-fontes.json"),
  JSON.stringify(
    {
      fonte: "IBGE — Censo 2010 / Nomes no Brasil",
      espelho: "MedidaSP/nomes-brasileiros-ibge",
      commit: COMMIT,
      sha256: hashes,
      pares: Object.keys(pareados).length,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${Object.keys(pareados).length} prenomes com frequências em ambas as listas.`,
);
