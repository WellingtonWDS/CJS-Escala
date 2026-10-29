import { bindPdfEvents } from "./pdf-download.js";
import { gerarCsv } from "./csv.js";
import { MESES } from "../config/regras-jornada.js";
export function bindExportEvents(state, env) {
  const { document, alert, Blob, URL, setTimeout, window } = env;
  bindPdfEvents(state, env);
  document.getElementById("btn-exportar-csv").onclick = () => {
    if (!state.escalaGerada) {
      alert("Gere a escala primeiro.");
      return;
    }
    const csv = gerarCsv(state);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = state.modeloEscala === "fixa" ? "escala-fixa-semanal.csv" : `escala-${MESES[state.mes]}-${state.ano}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  document.getElementById("btn-imprimir").onclick = () => window.print();
}
