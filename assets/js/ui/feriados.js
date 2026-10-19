import { diasNoMes } from "../domain/datas-horas.js";
import { MESES, DIAS_SEMANA } from "../config/regras-jornada.js";
import { escapeHtml } from "../shared/formatacao.js";

export function createFeriadosUI({ state, storage, env, invalidarEscala }) {
  const { saveState } = storage;
  const { document, alert } = env;

  function renderFeriadoContexto() {
    document.getElementById("feriado-contexto").textContent =
      `O dia informado é relativo a ${MESES[state.mes]}/${state.ano}. No 5×2 e 6×1, feriados não trabalhados contam entre as folgas da semana; só são escolhidas as folgas restantes. Se dias fechados e feriados já ultrapassarem o total, todos são preservados e o relatório informa o motivo. Marque “Trabalhar neste feriado” se a empresa funcionar nessa data (o colaborador ainda pode estar de folga). Carnaval e Corpus Christi não são adicionados automaticamente como feriados nacionais.`;
  }

  function renderFeriados() {
    const wrap = document.getElementById("feriados-list");
    renderFeriadoContexto();
    if (!state.feriados.length) {
      wrap.innerHTML =
        '<p class="text-slate-500 text-sm">Nenhum feriado cadastrado neste mês.</p>';
      return;
    }
    const nomeSemana = (dia) =>
      DIAS_SEMANA[new Date(state.ano, state.mes, dia).getDay()];
    wrap.innerHTML = state.feriados
      .map(
        (f, idx) => `
    <div class="flex flex-wrap justify-between items-center gap-2.5 px-3 py-2.5 border border-slate-200 rounded-lg mb-2 bg-slate-50">
      <div><b class="block text-sm font-semibold">${escapeHtml(f.nome)}</b><span class="text-slate-500 text-xs">${nomeSemana(f.dia)}, dia ${String(f.dia).padStart(2, "0")} de ${MESES[state.mes]} · ${f.tipo === "nacional" ? "Nacional" : f.tipo === "religioso" ? "Religioso" : "Local/municipal"}</span></div>
      <div class="flex items-center gap-2 shrink-0">
        <label class="flex items-center gap-2 text-xs font-semibold text-fintria-navy cursor-pointer">
          <input type="checkbox" data-feriado-trabalhado="${idx}" ${f.trabalhado ? "checked" : ""} class="w-4 h-4 rounded border-slate-300 accent-blue-800">
          Trabalhar neste feriado
        </label>
        <button data-remove-feriado="${idx}" title="Remover feriado" class="text-fintria-vermelho bg-transparent text-base px-2 py-1.5 rounded hover:bg-red-50">✕</button>
      </div>
    </div>
  `,
      )
      .join("");

    wrap.querySelectorAll("[data-feriado-trabalhado]").forEach((sel) => {
      sel.onchange = (e) => {
        state.feriados[Number(e.target.dataset.feriadoTrabalhado)].trabalhado =
          e.target.checked;
        invalidarEscala();
        saveState();
      };
    });
    wrap.querySelectorAll("[data-remove-feriado]").forEach((btn) => {
      btn.onclick = () => {
        const removido = state.feriados[Number(btn.dataset.removeFeriado)];
        state.feriadosLocais = (state.feriadosLocais || []).filter(
          (f) =>
            !(
              f.ano === removido.ano &&
              f.mes === removido.mes &&
              f.dia === removido.dia
            ),
        );
        state.feriados.splice(Number(btn.dataset.removeFeriado), 1);
        invalidarEscala();
        renderFeriados();
        saveState();
      };
    });
  }

  return { renderFeriadoContexto, renderFeriados, bindEvents };
  function bindEvents() {
    document.getElementById("btn-add-feriado").onclick = () => {
      const dia = Number(document.getElementById("fer-dia").value);
      const nome = document.getElementById("fer-nome").value.trim();
      const total = diasNoMes(state.mes, state.ano);
      if (!dia || dia < 1 || dia > total || !nome) {
        alert(`Informe um dia válido (1 a ${total}) e um nome.`);
        return;
      }
      if (state.feriados.some((f) => f.dia === dia)) {
        alert("Já existe um feriado cadastrado neste dia.");
        return;
      }
      state.feriados.push({
        dia,
        nome,
        tipo: "municipal",
        mes: state.mes,
        ano: state.ano,
        trabalhado: false,
      });
      state.feriados.sort((a, b) => a.dia - b.dia);
      document.getElementById("fer-dia").value = "";
      document.getElementById("fer-nome").value = "";
      invalidarEscala();
      renderFeriados();
      saveState();
    };
  }
}
