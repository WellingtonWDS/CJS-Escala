import { bindPdfEvents } from "./pdf-download.js";
export function bindExportEvents(state, env) {
  const { document, window } = env;
  bindPdfEvents(state, env);
  document.getElementById("btn-imprimir").onclick = () => window.print();
}
