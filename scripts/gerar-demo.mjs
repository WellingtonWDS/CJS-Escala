import { readFile, writeFile } from "node:fs/promises";
import { criarEstadoDemo } from "../database/demo/state.mjs";
import { criarCenariosSegmentos } from "../database/demo/segmentos.mjs";
for (const [templateFile, output, token, dados] of [
  ["install.template.sql", "install.sql", "__DEMO_STATE__", criarEstadoDemo()],
  ["segmentos.template.sql", "segmentos.sql", "__DEMO_SEGMENTOS__", criarCenariosSegmentos()],
]) {
  const template = await readFile(new URL(`../database/demo/${templateFile}`, import.meta.url), "utf8");
  await writeFile(new URL(`../database/demo/${output}`, import.meta.url), template.replace(token, JSON.stringify(dados)));
  console.log(`SQL DEMO atualizado em database/demo/${output}`);
}
