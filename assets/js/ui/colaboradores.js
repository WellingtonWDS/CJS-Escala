import { escapeHtml } from "../shared/formatacao.js";

export function createColaboradoresUI({
  state,
  storage,
  env,
  invalidarEscala,
  renderResumo,
  onFuncoesChange = () => {},
}) {
  const { saveState } = storage;
  const { document } = env;

  function renderColaboradores() {
    onFuncoesChange();
    const list = document.getElementById("colab-list");
    list.innerHTML =
      state.colaboradores
        .map((c, idx) => {
          if (!Number.isFinite(Number(c.horasSemana))) c.horasSemana = 44;
          return `<div class="relative grid grid-cols-1 md:grid-cols-[1.7fr_0.9fr_1.2fr_0.9fr_auto] gap-2.5 items-end border border-slate-200 rounded-lg p-3 mb-2.5 bg-slate-50">
      <span class="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-fintria-verde text-white text-[11px] flex items-center justify-center">${idx + 1}</span>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Nome</label><input data-id="${c.id}" data-field="nome" value="${escapeHtml(c.nome)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Sexo</label>
        <select data-id="${c.id}" data-field="sexo" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white">
          <option value="feminino" ${c.sexo === "feminino" ? "selected" : ""}>Feminino</option>
          <option value="masculino" ${c.sexo === "masculino" ? "selected" : ""}>Masculino</option>
        </select>
      </div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Cargo / função</label><input data-id="${c.id}" data-field="cargo" value="${escapeHtml(c.cargo)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Jornada semanal</label><div class="relative"><input type="number" min="1" max="60" step="0.5" data-id="${c.id}" data-field="horasSemana" value="${Number(c.horasSemana) || 44}" class="w-full px-2.5 py-2 pr-8 border border-slate-300 rounded-md text-sm bg-white"><span class="absolute right-2.5 top-2.5 text-xs text-slate-400">h</span></div></div>
      <button data-remove="${c.id}" title="Remover" class="text-fintria-vermelho bg-transparent text-base px-2 py-2 rounded hover:bg-red-50">✕</button>
    </div>`;
        })
        .join("") ||
      '<p class="text-slate-500 text-sm">Nenhum colaborador cadastrado ainda.</p>';

    list.querySelectorAll("input,select").forEach((el) => {
      el.onchange = (e) => {
        const id = Number(e.target.dataset.id);
        const c = state.colaboradores.find((x) => x.id === id);
        if (c) {
          c[e.target.dataset.field] =
            e.target.dataset.field === "horasSemana"
              ? Number(e.target.value)
              : e.target.value;
          if (c.horasSemana <= 0) c.horasSemana = 44;
          invalidarEscala();
          saveState();
          onFuncoesChange();
        }
      };
    });
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.onclick = () => {
        state.colaboradores = state.colaboradores.filter(
          (c) => c.id !== Number(btn.dataset.remove),
        );
        invalidarEscala();
        renderColaboradores();
        renderResumo();
        saveState();
      };
    });
  }

  return { renderColaboradores, bindEvents };
  function bindEvents() {
    document.getElementById("btn-add-colab").onclick = () => {
      state.colaboradores.push({
        id: state.proximoId++,
        nome: "",
        sexo: "feminino",
        cargo: "",
        horasSemana: 44,
      });
      invalidarEscala();
      renderColaboradores();
      saveState();
    };
  }
}
