import { ciclo12x36, politicaPlantaoDeclarada } from "../domain/computo-cct.js";
import { escapeHtml as esc } from "../shared/formatacao.js";
const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export function resumoComputoDominio(c, state = {}) {
  const p = c.quadroDominio;
  return `${ciclo12x36(state, p) ? `<p class="text-sm mt-2 font-semibold text-fintria-navy">Ciclo 12×36 identificado${politicaPlantaoDeclarada(state) ? " conforme as condições declaradas de cômputo da CCT" : ""}.</p>` : ""}
    ${Number.isFinite(p.horasComputadasCalculadas) ? `<p class="text-xs mt-2">Referência computada pela CCT: ${p.horasComputadasCalculadas}h/semana (média do ciclo, sujeita à vigência).</p>` : ""}`;
}
export function camposDominio(c, state = {}) {
  const p = c.quadroDominio;
  if (!p)
    return `<div class="col-span-full"><button type="button" data-horario-individual="${c.id}" class="border rounded-md px-3 py-2 text-sm text-fintria-navy">Definir horário individual por dia</button></div>`;
  const input = (field, value, type = "text") =>
    `<input type="${type}" data-id="${c.id}" data-dominio="${field}" value="${esc(value || "")}" class="border rounded p-1.5 w-full bg-white">`;
  const horarios = p.tipo === "ciclo" ? p.ciclo : p.semana;
  return `<details data-perfil-dominio="${c.id}" class="col-span-full border-t border-slate-200 pt-2"><summary class="cursor-pointer text-sm font-semibold text-fintria-navy">${p.origem === "manual" ? "Horário individual do colaborador" : `Horário individual importado da Domínio — ${esc(p.codigo)}`}</summary>
    ${p.origem !== "manual" ? `<p class="text-xs mt-2">Código: ${esc(p.codigo)} · Admissão no relatório: ${esc(p.admissao || "Não informada")} · CTPS: ${esc(p.ctps || "Não informada")} · Série: ${esc(p.serie || "Não informada")} · Visto fiscal: ${esc(p.vistoFiscal || "Não informado")}</p>` : ""}
    <p class="text-xs text-slate-500 mt-2">${p.origem === "manual" ? "Horários informados neste cadastro." : `${esc(p.arquivo)} · aba ${esc(p.aba)} · linha ${p.linha}.`} Horas de relógio calculadas: <span data-horas-dominio="${c.id}">${p.horasCalculadas ?? "indeterminadas"}</span>h/semana${p.tipo === "ciclo" ? " (média do ciclo)" : ""}.${p.origem === "manual" ? "" : " O relatório não informa o sexo; confira esse campo."}</p>
    <div data-resumo-computo-dominio="${c.id}">${resumoComputoDominio(c, state)}</div>
    <label class="text-sm flex gap-2 items-center mt-3"><input type="checkbox" data-id="${c.id}" data-dominio="ativo" ${p.ativo !== false ? "checked" : ""}>Usar este horário individual na geração e cobertura</label>
    <label class="text-sm flex gap-2 items-center mt-2"><input type="checkbox" data-id="${c.id}" data-dominio="cargaConfirmada" ${p.cargaConfirmada ? "checked" : ""}>Manter a carga contratual informada, sem recalculá-la ao editar os horários</label>
    <p class="text-xs text-slate-500 mt-2">Marcado: preserva a carga contratual acima. Desmarcado: estima a carga pela soma dos horários. Em ambos os casos, a geração respeita os horários individuais e os limites aplicáveis; esta opção não autoriza horas extras.</p>
    <p class="text-xs text-slate-500 mt-2">Meio período sem pausa: preencha Entrada e Intervalo início (como horário final), deixando Intervalo fim e Saída vazios; ou preencha apenas Entrada e Saída. Para sábado compensado, os horários são a disponibilidade para eventual reposição, não trabalho fixo. A marcação não dispensa a base legal da compensação nem elimina excessos de jornada.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><label class="text-xs">Padrão<select data-id="${c.id}" data-dominio="tipo" class="border rounded p-2 w-full bg-white"><option value="semanal" ${p.tipo === "semanal" ? "selected" : ""}>Dias da semana</option><option value="ciclo" ${p.tipo === "ciclo" ? "selected" : ""}>Ciclo de dias / plantões</option></select></label><label class="text-xs">Admissão considerada na escala${input("admissaoIso", p.admissaoIso, "date")}</label></div>
    ${p.tipo === "ciclo" ? `<label class="block text-xs mt-3">Data em que ocorre o 1º dia do ciclo deste colaborador${input("ancora", p.ancora, "date")}</label><p class="text-xs mt-1">A planilha informa a ordem do ciclo, mas não sua data inicial. Não é presumido que todos os colaboradores pertençam ao mesmo grupo.</p>` : ""}
    <div class="overflow-x-auto mt-3"><table class="w-full text-xs"><thead><tr>${["Dia", "Situação", "Entrada", "Intervalo início", "Intervalo fim", "Saída"].map((t) => `<th class="text-left p-1">${t}</th>`).join("")}</tr></thead><tbody>${Object.entries(
      horarios,
    )
      .map(
        ([d, h]) =>
          `<tr><td class="p-1">${p.tipo === "ciclo" ? `${d}º dia` : DIAS[d]}</td><td class="p-1"><select data-id="${c.id}" data-dominio="status" data-dia="${d}" class="border rounded p-1 bg-white">${[
            ["nao_informado", "Conferir"],
            ["trabalho", "Trabalho"],
            ["folga", "Folga"],
            ...(p.tipo === "semanal" && Number(d) === 6
              ? [["compensado", "Compensado"]]
              : []),
          ]
            .map(
              ([v, t]) =>
                `<option value="${v}" ${h.status === v ? "selected" : ""}>${t}</option>`,
            )
            .join(
              "",
            )}</select></td>${["entrada", "intInicio", "intFim", "saida"].map((f) => `<td class="p-1"><input type="time" data-id="${c.id}" data-dominio="horario" data-dia="${d}" data-horario="${f}" value="${esc(h.jornada?.[f] || "")}" class="border rounded p-1 bg-white min-w-[100px]" ${h.status === "folga" ? "disabled" : ""}></td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div>
    <ul data-pendencias-dominio="${c.id}" class="text-xs text-fintria-ambar list-disc pl-4 mt-2">${p.pendencias.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    ${p.origem !== "manual" ? `<details class="mt-3 text-xs"><summary class="cursor-pointer">Valores originais do relatório</summary><div class="overflow-x-auto"><table class="w-full"><thead><tr>${["Linha", "Dias", "Entrada", "Intervalo", "Saída", "Situação"].map((s) => `<th class="p-1 text-left">${s}</th>`).join("")}</tr></thead><tbody>${p.linhasOriginais.map((l) => `<tr>${[l.linha, l.dias, l.entrada, l.intervalo, l.saida, l.situacao].map((s) => `<td class="p-1">${esc(s)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>` : ""}
  </details>`;
}
