import { bindPdfEvents } from "./pdf-download.js";
import { bindTermoAditivoEvents } from "./termo-aditivo-download.js";
import { bindConferenciaDiagnostico } from "../ui/conferencia-diagnostico.js";
export function bindExportEvents(state, env) {
  bindPdfEvents(state, env);
  bindTermoAditivoEvents(state, env);
  bindConferenciaDiagnostico(state, env);
}
