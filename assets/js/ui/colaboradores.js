import { camposEnquadramento } from "./enquadramento-ec141.js";
import { escapeHtml } from "../shared/formatacao.js";
import { camposDominio } from "./dominio-colaborador.js";
import { atualizarPerfilDominio } from "../import/dominio.js";

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
    const abertos = [
      ...list.querySelectorAll("details[data-perfil-dominio][open]"),
    ].map((el) => el.dataset.perfilDominio);
    list.innerHTML =
      state.colaboradores
        .map((c, idx) => {
          if (!c.quadroDominio && !Number.isFinite(Number(c.horasSemana)))
            c.horasSemana = 44;
          return `<div class="relative grid grid-cols-1 md:grid-cols-[1.7fr_0.9fr_1.2fr_0.9fr_auto] gap-2.5 items-end border border-slate-200 rounded-lg p-3 mb-2.5 bg-slate-50">
      <span class="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-fintria-verde text-white text-[11px] flex items-center justify-center">${idx + 1}</span>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Nome</label><input data-id="${c.id}" data-field="nome" value="${escapeHtml(c.nome)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Sexo</label>
        <select data-id="${c.id}" data-field="sexo" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white">
          ${c.sexo === "nao_informado" ? '<option value="nao_informado" selected>Não informado</option>' : ""}
          <option value="feminino" ${c.sexo === "feminino" ? "selected" : ""}>Feminino</option>
          <option value="masculino" ${c.sexo === "masculino" ? "selected" : ""}>Masculino</option>
        </select>
      </div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Cargo / função</label><input data-id="${c.id}" data-field="cargo" value="${escapeHtml(c.cargo)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Jornada contratual de referência</label><div class="relative"><input type="number" min="1" max="60" step="0.5" data-id="${c.id}" data-field="horasSemana" value="${c.quadroDominio ? (c.horasSemana ?? "") : Number(c.horasSemana) || 44}" placeholder="Conferir" class="w-full px-2.5 py-2 pr-8 border border-slate-300 rounded-md text-sm bg-white"><span class="absolute right-2.5 top-2.5 text-xs text-slate-400">h</span></div></div>
      <button data-remove="${c.id}" title="Remover" class="text-fintria-vermelho bg-transparent text-base px-2 py-2 rounded hover:bg-red-50">✕</button>
      ${state.analiseEnquadramentoAtiva === true ? camposEnquadramento(c) : ""}
      ${camposDominio(c)}
    </div>`;
        })
        .join("") ||
      '<p class="text-slate-500 text-sm">Nenhum colaborador cadastrado ainda.</p>';

    list.querySelectorAll("input,select").forEach((el) => {
      el.onchange = (e) => {
        const id = Number(e.target.dataset.id);
        const c = state.colaboradores.find((x) => x.id === id);
        if (c && e.target.dataset.dominio) {
          const p = c.quadroDominio,
            key = e.target.dataset.dominio;
          if (key === "horario" || key === "status") {
            const mapa = p.tipo === "ciclo" ? p.ciclo : p.semana;
            const h = mapa[e.target.dataset.dia];
            if (key === "status") h.status = e.target.value;
            else {
              h.jornada ??= {
                entrada: "",
                intInicio: "",
                intFim: "",
                saida: "",
              };
              h.jornada[e.target.dataset.horario] = e.target.value;
            }
          } else if (key === "tipo") {
            if (e.target.value === "ciclo" && !Object.keys(p.ciclo).length)
              p.ciclo = {
                1: structuredClone(
                  Object.values(p.semana).find(
                    (h) => h.status === "trabalho",
                  ) || { status: "nao_informado" },
                ),
                2: { status: "folga" },
              };
            if (e.target.value === "semanal" && !Object.keys(p.semana).length)
              p.semana = Object.fromEntries(
                [0, 1, 2, 3, 4, 5, 6].map((d) => [
                  d,
                  { status: "nao_informado" },
                ]),
              );
            p.tipo = e.target.value;
          } else
            p[key] =
              e.target.type === "checkbox" ? e.target.checked : e.target.value;
          atualizarPerfilDominio(c);
          invalidarEscala();
          saveState();
          if (key !== "horario") renderColaboradores();
          else {
            const horas = list.querySelector(
              `[data-id="${c.id}"][data-field="horasSemana"]`,
            );
            if (horas) horas.value = c.horasSemana ?? "";
            const calculadas = list.querySelector(
              `[data-horas-dominio="${c.id}"]`,
            );
            if (calculadas)
              calculadas.textContent = p.horasCalculadas ?? "indeterminadas";
            const avisos = list.querySelector(
              `[data-pendencias-dominio="${c.id}"]`,
            );
            if (avisos)
              avisos.innerHTML = p.pendencias
                .map((t) => `<li>${escapeHtml(t)}</li>`)
                .join("");
          }
          renderResumo();
          return;
        }
        if (c && e.target.dataset.ec141) {
          c.ec141 ??= {};
          c.ec141[e.target.dataset.ec141] =
            e.target.type === "checkbox"
              ? e.target.checked
              : e.target.type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value;
          invalidarEscala();
          saveState();
          if (e.target.dataset.ec141 === "tipo") renderColaboradores();
        } else if (c) {
          c[e.target.dataset.field] =
            e.target.dataset.field === "horasSemana"
              ? Number(e.target.value)
              : e.target.value;
          if (c.horasSemana <= 0 && !c.quadroDominio) c.horasSemana = 44;
          if (c.quadroDominio) {
            if (e.target.dataset.field === "horasSemana")
              c.quadroDominio.cargaConfirmada = true;
            atualizarPerfilDominio(c);
            const avisos = list.querySelector(
              `[data-pendencias-dominio="${c.id}"]`,
            );
            if (avisos)
              avisos.innerHTML = c.quadroDominio.pendencias
                .map((t) => `<li>${escapeHtml(t)}</li>`)
                .join("");
            const conferido = list.querySelector(
              `[data-id="${c.id}"][data-dominio="cargaConfirmada"]`,
            );
            if (conferido) conferido.checked = c.quadroDominio.cargaConfirmada;
          }
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
    for (const el of list.querySelectorAll("details[data-perfil-dominio]"))
      if (abertos.includes(el.dataset.perfilDominio)) el.open = true;
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
