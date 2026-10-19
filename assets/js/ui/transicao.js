import { fmtHoras } from "../domain/datas-horas.js";

export function createTransicaoUI({ state, domain, env }) {
  const { calcularSaidaSimulada } = domain;

  const { document } = env;

  function renderSimuladorPec() {
    const atualDias =
      state.tipoEscala === "12x36"
        ? 3.5
        : Math.max(1, state.diasTrabalho.length);
    const atualHoras = state.tipoEscala === "12x36" ? 42 : 44;

    const fases = [
      {
        label: "Antes da 1ª fase",
        tag: "44h",
        horasSemana: 44,
        diasSemana: state.tipoEscala === "5x2" ? 5 : Math.min(6, atualDias),
        head: "#0B2545",
        obs: "Até 15/12/2026 · EC 141",
      },
      {
        label: "1ª fase da transição",
        tag: "42h",
        horasSemana: 42,
        diasSemana: 5,
        head: "#B9791C",
        obs: "A partir de 16/12/2026 · 2 meses após a publicação no DOU",
      },
      {
        label: "2ª fase da transição",
        tag: "40h",
        horasSemana: 40,
        diasSemana: 5,
        head: "#1F7A54",
        obs: "A partir de 16/12/2027 · 14 meses após a publicação no DOU",
      },
    ];

    const cards = fases
      .map((f) => {
        const calc = calcularSaidaSimulada(f.horasSemana, f.diasSemana);
        return `<div class="border-[1.5px] border-slate-200 rounded-lg overflow-hidden">
      <div class="px-3.5 py-3 text-white" style="background:${f.head}"><div class="text-xs opacity-85">${f.tag}</div><div class="font-display text-[17px] font-bold">${f.label}</div></div>
      <div class="p-3.5 text-sm">
        <div class="flex justify-between py-1.5 border-b border-slate-200"><span>Horas/semana</span><b>${fmtHoras(f.horasSemana)}</b></div>
        <div class="flex justify-between py-1.5 border-b border-slate-200"><span>Horas/dia médio</span><b>${fmtHoras(calc.horasDia)}</b></div>
        <div class="flex justify-between py-1.5 border-b border-slate-200"><span>Dias de trabalho</span><b>${f.diasSemana}</b></div>
        <div class="flex justify-between py-1.5 border-b border-slate-200"><span>Folgas</span><b>${7 - f.diasSemana}</b></div>
        <div class="flex justify-between py-1.5 border-b border-slate-200"><span>Entrada</span><b>${state.jornada.entrada}</b></div>
        <div class="flex justify-between py-1.5"><span>Saída estimada</span><b>${calc.saida}</b></div>
        <div class="text-[11px] text-slate-500 mt-2">${f.obs}. A saída é uma projeção matemática, não uma determinação jurídica.</div>
      </div>
    </div>`;
      })
      .join("");

    const rows = [
      ["Horas/semana", "44:00", "42:00", "40:00"],
      ["Dias de trabalho", "5/6*", "5", "5"],
      ["Repousos semanais", "1**", "2", "2"],
      ["Redução em relação a 44h", "—", "02:00", "04:00"],
      [
        "Salário e pisos",
        "Proteção a partir da publicação",
        "Sem redução salarial",
        "Sem redução salarial",
      ],
      ["Divisor de HE", "Não presumir", "Não presumir", "Não presumir"],
    ];

    const table = `<div class="overflow-x-auto"><table class="w-full border-collapse text-sm mt-4 min-w-[680px]">
    <thead><tr>${["Métrica", "Antes da 1ª fase", "1ª fase · +2 meses", "2ª fase · +14 meses"].map((x) => `<th class="px-2.5 py-2 border-b border-slate-200 text-left text-slate-500 text-xs">${x}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="px-2.5 py-2 border-b border-slate-200">${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>
  <p class="text-xs text-slate-500 mt-2">* A escala efetiva depende do padrão configurado. ** O segundo repouso remunerado começa em 16/12/2026, junto com a fase de 42h da EC 141. A regra geral de 8h diárias admite compensação conforme o instrumento aplicável.</p>`;

    document.getElementById("pec-resultado").innerHTML =
      `<div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">${cards}</div>${table}`;
  }

  return { renderSimuladorPec, bindEvents };
  function bindEvents() {
    document.getElementById("btn-simular-pec").onclick = renderSimuladorPec;
  }
}
