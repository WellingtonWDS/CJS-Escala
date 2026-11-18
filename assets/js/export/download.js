import { bindPdfEvents } from "./pdf-download.js";
import { bindTermoAditivoEvents } from "./termo-aditivo-download.js";
export function bindExportEvents(state, env) {
  bindPdfEvents(state, env);
  bindTermoAditivoEvents(state, env);
}
