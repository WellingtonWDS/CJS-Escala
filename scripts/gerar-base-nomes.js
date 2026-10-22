import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const COMMIT = "a1e2df8b26aaf626e0f35be1f66b72f83c8f696f";
const ESPELHO = "ggustavowerlangg/ibge-nomes-2022";
const ARQUIVO = "nomes_ibge.csv";
const SHA256 =
  "dbd34d9dde656a8b0df95174e5a8deb0b9e6b035b0e42da313e844566f129cd1";
const FONTE = "IBGE/Censo 2022 — espelho ggustavowerlangg/ibge-nomes-2022";
const VERSAO = "ibge2022-a1e2df8b";
const root = fileURLToPath(new URL("../", import.meta.url));
const pasta = process.argv
  .find((a) => a.startsWith("--source-dir="))
  ?.slice(13);
let bytes;
if (pasta) bytes = await readFile(join(pasta, ARQUIVO));
else {
  const response = await fetch(
    `https://raw.githubusercontent.com/${ESPELHO}/${COMMIT}/${ARQUIVO}`,
  );
  if (!response.ok)
    throw new Error(
      `Não foi possível baixar a fonte: HTTP ${response.status}.`,
    );
  bytes = Buffer.from(await response.arrayBuffer());
}
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== SHA256)
  throw new Error("A fonte diverge do SHA-256 da revisão fixada.");
const linhas = bytes
  .toString("utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/);
if (linhas.shift() !== "nome;sexo;frequencia")
  throw new Error("Cabeçalho da fonte mudou.");
const dados = new Map();
for (const linha of linhas) {
  const m = linha.match(/^([^;]+);([FM]);(\d+)$/);
  if (!m) throw new Error("Linha da fonte inválida.");
  const nome = m[1]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (!/^[A-Z]+$/.test(nome))
    throw new Error("Prenome fora do formato esperado.");
  const indice = m[2] === "F" ? 0 : 1,
    contagens = dados.get(nome) || [null, null];
  if (contagens[indice] !== null)
    throw new Error("Nome/sexo duplicado na fonte.");
  const frequencia = Number(m[3]);
  if (!Number.isSafeInteger(frequencia) || frequencia < 0)
    throw new Error("Frequência inválida.");
  contagens[indice] = frequencia;
  dados.set(nome, contagens);
}
// Uma frequência ausente continua desconhecida; não vira zero ou certeza de 100%.
const pareados = Object.fromEntries(
  [...dados]
    .filter(([, c]) => c.every((v) => Number.isSafeInteger(v) && v > 0))
    .sort(([a], [b]) => a.localeCompare(b, "en")),
);
const texto = `// Gerado por scripts/gerar-base-nomes.js. Fonte e limites: FONTES-NOMES.md.\nexport const FONTE_NOMES = ${JSON.stringify(FONTE)};\nexport const VERSAO_BASE_NOMES = ${JSON.stringify(VERSAO)};\nexport const NOMES_IBGE = Object.freeze(${JSON.stringify(pareados)});\n`;
await mkdir(join(root, "assets/js/data"), { recursive: true });
await writeFile(join(root, "assets/js/data/nomes-ibge.js"), texto);
await writeFile(
  join(root, "assets/js/data/nomes-ibge-fontes.json"),
  JSON.stringify(
    {
      fonte: "IBGE — Censo 2022 / Nomes no Brasil (conforme o espelho)",
      espelho: ESPELHO,
      commit: COMMIT,
      arquivo: ARQUIVO,
      sha256: hash,
      registros: linhas.length,
      prenomes: dados.size,
      pares: Object.keys(pareados).length,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${Object.keys(pareados).length} prenomes com frequências em ambos os sexos, entre ${dados.size} prenomes da fonte.`,
);
