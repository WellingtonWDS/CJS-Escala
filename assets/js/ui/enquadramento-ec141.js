import { escapeHtml } from "../shared/formatacao.js";
export function camposEnquadramento(c) {
  const e = c.ec141 || {};
  const input = (field, label, type = "number") =>
    `<label class="block text-xs text-slate-600">${label}<input data-id="${c.id}" data-ec141="${field}" type="${type}" ${type === "number" ? 'min="0" step="0.01"' : ""} value="${escapeHtml(e[field] ?? "")}" class="mt-1 w-full border border-slate-300 rounded-md p-2 bg-white"></label>`;
  const check = (field, label) =>
    `<label class="flex items-center gap-2 text-xs text-slate-600"><input data-id="${c.id}" data-ec141="${field}" type="checkbox" ${e[field] ? "checked" : ""} class="w-4 h-4 accent-blue-800">${label}</label>`;
  return `<details class="col-span-full border-t border-slate-200 pt-2"><summary class="cursor-pointer text-sm font-semibold text-fintria-navy">Enquadramento EC 141 e proteção salarial</summary>
    <p class="text-xs text-slate-500 my-2">Dados declarados para o período selecionado. As condições documentais aparecem como pendências até conferência. A ferramenta não altera salários.</p>
    <label class="block text-xs font-semibold mb-3">Enquadramento<select data-id="${c.id}" data-ec141="tipo" class="mt-1 block w-full border rounded p-2 bg-white">${[
      ["geral", "Regra geral"],
      ["art8", "Art. 8º — diploma superior e remuneração qualificada"],
      ["contrato_publico", "Art. 9º — empregado alocado em contrato público"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${(e.tipo || "geral") === v ? "selected" : ""}>${l}</option>`,
      )
      .join("")}</select></label>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${input("salarioAnterior", "Remuneração anterior (R$)")}${input("salarioAtual", "Remuneração atual (R$)")}${input("pisoAnterior", "Piso anterior (R$; zero se inexistente)")}${input("pisoAtual", "Piso atual (R$; zero se inexistente)")}</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" ${e.tipo === "art8" ? "" : "hidden"}>${check("diplomaSuperior", "Diploma de nível superior")}${check("empregadoPublico", "Empregado público (impede a exceção do art. 8º)")}${input("remuneracao", "Remuneração para o art. 8º (R$)")}${input("tetoRgps", "Teto RGPS aplicável ao período (R$)")}${check("jornadaMantida", "Jornada mantida por liberalidade ou previsão coletiva")}</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" ${e.tipo === "contrato_publico" ? "" : "hidden"}>${check("contratoVigente", "Contrato vigente na publicação de 16/10/2026")}${check("maoDeObraDireta", "Execução com emprego direto de mão de obra")}${input("dataAditamento", "Data do aditamento (vazio: prazo máximo legal)", "date")}</div>
  </details>`;
}
