import { readFile, writeFile } from "node:fs/promises";
import { criarEstadoDemo } from "../database/demo/state.mjs";
const template = await readFile(new URL("../database/demo/install.template.sql", import.meta.url), "utf8");
await writeFile(new URL("../database/demo/install.sql", import.meta.url), template.replace("__DEMO_STATE__", JSON.stringify(criarEstadoDemo())));
console.log("SQL DEMO atualizado em database/demo/install.sql");
