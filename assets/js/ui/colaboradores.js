import { bindAjudas } from "./ajuda-campo.js";
import { camposHabilitacoes, bindHabilitacoes } from "./habilitacoes.js";
import { camposRestricoes, bindRestricoes } from "./restricoes.js";
import { preencherSexoPorNome } from "../domain/sexo-por-nome.js";
import { mostrarColaboradores } from "./lista-colaboradores.js";
import { prepararImportacao } from "../import/colaboradores.js";
import { camposEnquadramento } from "./enquadramento-ec141.js";
import { escapeHtml } from "../shared/formatacao.js";
import { camposDominio, resumoComputoDominio } from "./dominio-colaborador.js";
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
  function descricaoSexo(c) {
    return c.sexoInferencia ? "Preenchido automaticamente" : "";
  }

  function renderColaboradores({ preservarEnquadramento = false } = {}) {
    onFuncoesChange();
    const list = document.getElementById("colab-list");
    const habilitacoesAbertas = [
      ...list.querySelectorAll("details[data-habilitacoes][open]"),
    ].map((el) => el.dataset.habilitacoes);
    const restricoesAbertas = [
      ...list.querySelectorAll("details[data-restricoes][open]"),
    ].map((el) => el.dataset.restricoes);
    const abertos = [
      ...list.querySelectorAll("details[data-perfil-dominio][open]"),
    ].map((el) => el.dataset.perfilDominio);
    const enquadramentosAbertos = preservarEnquadramento
      ? [...list.querySelectorAll("details[open]")]
          .map((el) => el.querySelector("[data-ec141]")?.dataset.id)
          .filter(Boolean)
      : [];
    list.innerHTML =
      state.colaboradores
        .map((c, idx) => {
          if (c.quadroDominio) atualizarPerfilDominio(c, state);
          if (!c.quadroDominio && !Number.isFinite(Number(c.horasSemana)))
            c.horasSemana = 44;
          return `<div class="relative grid grid-cols-1 md:grid-cols-[1.7fr_0.9fr_1.2fr_0.9fr_auto] gap-2.5 items-end border border-slate-200 rounded-lg p-3 mb-2.5 bg-slate-50">
      <span class="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-fintria-verde text-white text-[11px] flex items-center justify-center">${idx + 1}</span>
      <div class="colaborador-principais col-span-full">
      <div class="colaborador-campo"><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Nome</label><input data-id="${c.id}" data-field="nome" value="${escapeHtml(c.nome)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div class="colaborador-campo"><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Sexo</label>
        <select aria-describedby="sexo-estimativa-${c.id}" data-id="${c.id}" data-field="sexo" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white">
          <option value="nao_informado" ${c.sexo === "nao_informado" ? "selected" : ""}>Não informado</option>
          <option value="feminino" ${c.sexo === "feminino" ? "selected" : ""}>Feminino</option>
          <option value="masculino" ${c.sexo === "masculino" ? "selected" : ""}>Masculino</option>
        </select>
        <p id="sexo-estimativa-${c.id}" data-sexo-estimativa="${c.id}" class="text-[11px] text-slate-500 mt-1">${escapeHtml(descricaoSexo(c))}</p>
      </div>
      <div class="colaborador-campo"><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Cargo / função</label><input data-id="${c.id}" data-field="cargo" value="${escapeHtml(c.cargo)}" class="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white"></div>
      <div class="colaborador-campo"><label class="block text-xs font-semibold text-fintria-navySoft mb-1.5">Jornada contratual de referência</label><div class="relative"><input type="number" min="1" max="44" step="0.5" data-id="${c.id}" data-field="horasSemana" value="${c.quadroDominio ? (c.horasSemana ?? "") : Number(c.horasSemana) || 44}" placeholder="Conferir" class="w-full px-2.5 py-2 pr-8 border border-slate-300 rounded-md text-sm bg-white"><span class="absolute right-2.5 top-2.5 text-xs text-slate-400">h</span></div></div>
      <button data-remove="${c.id}" title="Remover" class="text-fintria-vermelho bg-transparent text-base px-2 py-2 rounded hover:bg-red-50">✕</button>
      </div>
      ${state.analiseEnquadramentoAtiva === true ? camposEnquadramento(c) : ""}
      <p data-carga-alerta="${c.id}" class="col-span-full text-xs text-fintria-vermelho" role="status">${Number(c.horasSemana) > 44 ? "Jornada contratual acima de 44h semanais: corrija a referência; horas extras não devem ser cadastradas como carga contratual." : ""}</p>
      ${camposDominio(c, state)}
      ${camposHabilitacoes(c, state.colaboradores)}
      ${camposRestricoes(c)}
    </div>`;
        })
        .join("") ||
      '<p class="text-slate-500 text-sm">Nenhum colaborador cadastrado ainda.</p>';

    bindAjudas(list);
    list
      .querySelectorAll("[data-field], [data-dominio], [data-ec141]")
      .forEach((el) => {
        el.onchange = (e) => {
          const id = Number(e.target.dataset.id);
          const c = state.colaboradores.find((x) => x.id === id);
          if (c && e.target.dataset.dominio) {
            const p = c.quadroDominio,
              key = e.target.dataset.dominio;
            if (key === "horario" || key === "status") {
              const mapa = p.tipo === "ciclo" ? p.ciclo : p.semana;
              const h = mapa[e.target.dataset.dia];
              if (key === "status") {
                h.status = e.target.value;
                if (
                  h.status === "compensado" &&
                  Number.isFinite(c.horasSemana) &&
                  c.horasSemana <= 44
                )
                  p.cargaConfirmada = true;
              } else {
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
                e.target.type === "checkbox"
                  ? e.target.checked
                  : e.target.value;
            atualizarPerfilDominio(c, state);
            invalidarEscala();
            saveState();
            if (key !== "horario") renderColaboradores();
            else {
              const horas = list.querySelector(
                `[data-id="${c.id}"][data-field="horasSemana"]`,
              );
              if (horas) horas.value = c.horasSemana ?? "";
              const alertaCarga = list.querySelector(
                `[data-carga-alerta="${c.id}"]`,
              );
              if (alertaCarga)
                alertaCarga.textContent =
                  Number(c.horasSemana) > 44
                    ? "Jornada contratual acima de 44h semanais: corrija a referência; horas extras não devem ser cadastradas como carga contratual."
                    : "";
              const computo = list.querySelector(
                `[data-resumo-computo-dominio="${c.id}"]`,
              );
              if (computo) computo.innerHTML = resumoComputoDominio(c, state);
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
            if (e.target.dataset.field === "sexo") {
              c.sexoOrigem = "usuario";
              delete c.sexoInferencia;
            }
            if (c.quadroDominio && e.target.dataset.field === "nome")
              preencherSexoPorNome(c);
            const sexo = list.querySelector(
              `[data-id="${c.id}"][data-field="sexo"]`,
            );
            if (sexo) sexo.value = c.sexo;
            const estimativa = list.querySelector(
              `[data-sexo-estimativa="${c.id}"]`,
            );
            if (estimativa) estimativa.textContent = descricaoSexo(c);
            if (c.quadroDominio) {
              if (e.target.dataset.field === "horasSemana")
                c.quadroDominio.cargaConfirmada = true;
              atualizarPerfilDominio(c, state);
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
              if (conferido)
                conferido.checked = c.quadroDominio.cargaConfirmada;
            }
            const alertaCarga = list.querySelector(
              `[data-carga-alerta="${c.id}"]`,
            );
            if (alertaCarga)
              alertaCarga.textContent =
                Number(c.horasSemana) > 44
                  ? "Jornada contratual acima de 44h semanais: corrija a referência; horas extras não devem ser cadastradas como carga contratual."
                  : "";
            invalidarEscala();
            saveState();
            onFuncoesChange();
            if (e.target.dataset.field === "cargo") renderColaboradores();
          }
        };
      });
    list.querySelectorAll("[data-replicar-horarios]").forEach(button=>{
      button.onclick=async()=>{
        const destino=state.colaboradores.find(c=>c.id===Number(button.dataset.replicarHorarios));
        const id=Number(list.querySelector(`[data-copiar-horarios="${destino.id}"]`).value);
        const origem=state.colaboradores.find(c=>c.id===id);
        if(!origem?.quadroDominio?.semana){await env.alert("Selecione um colaborador com horários por dia cadastrados.");return;}
        if(!await env.confirm(`Substituir os horários por dia de ${destino.nome} pelos de ${origem.nome}?`))return;
        destino.quadroDominio.semana=structuredClone(origem.quadroDominio.semana);
        atualizarPerfilDominio(destino,state);invalidarEscala();saveState();renderColaboradores();renderResumo();
      };
    });
    list.querySelectorAll("[data-horario-individual]").forEach((button) => {
      button.onclick = () => {
        const c = state.colaboradores.find(
          (c) => c.id === Number(button.dataset.horarioIndividual),
        );
        c.quadroDominio = {
          origem: "manual",
          ativo: true,
          tipo: "semanal",
          cargaConfirmada: true,
          semana: Object.fromEntries(
            [0, 1, 2, 3, 4, 5, 6].map((d) => [
              d,
              state.diasTrabalho.includes(d)
                ? {
                    status: "trabalho",
                    jornada: structuredClone(
                      state.horarioPorDia
                        ? state.jornadaPorDia?.[d] || state.jornada
                        : state.jornada,
                    ),
                  }
                : { status: "folga" },
            ]),
          ),
          ciclo: {},
          pendencias: [],
          linhasOriginais: [],
        };
        atualizarPerfilDominio(c, state);
        invalidarEscala();
        saveState();
        renderColaboradores();
        list.querySelector(`[data-perfil-dominio="${c.id}"]`).open = true;
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
    bindHabilitacoes({
      list,
      state,
      onChange: () => {
        invalidarEscala();
        saveState();
        onFuncoesChange();
      },
    });
    for (const el of list.querySelectorAll("details[data-habilitacoes]"))
      if (habilitacoesAbertas.includes(el.dataset.habilitacoes)) el.open = true;
    bindRestricoes({
      list,
      state,
      onChange: () => {
        invalidarEscala();
        saveState();
        renderResumo();
      },
      render: renderColaboradores,
    });
    for (const el of list.querySelectorAll("details[data-restricoes]"))
      if (restricoesAbertas.includes(el.dataset.restricoes)) el.open = true;
    for (const el of list.querySelectorAll("details[data-perfil-dominio]"))
      if (abertos.includes(el.dataset.perfilDominio)) el.open = true;
    for (const id of enquadramentosAbertos) {
      const campo = list.querySelector(`[data-id="${id}"][data-ec141]`);
      if (campo) campo.closest("details").open = true;
    }
  }

  return { renderColaboradores, bindEvents };
  function bindEvents() {
    document.getElementById("btn-sugerir-sexos").onclick = () => {
      let preenchidos = 0;
      for (const c of state.colaboradores)
        if (c.quadroDominio && preencherSexoPorNome(c)) preenchidos++;
      if (preenchidos) {
        invalidarEscala();
        renderColaboradores();
        renderResumo();
        saveState();
      }
      document.getElementById("colaboradores-mensagem").textContent =
        preenchidos
          ? `${preenchidos} campo(s) de sexo preenchido(s) ou estimativa(s) atualizada(s) por alta predominância na base. Confira as indicações abaixo; os demais continuam não informados.`
          : "Nenhum campo foi alterado. Os nomes sem dados suficientes ou abaixo de 99% de predominância continuam não informados; escolhas manuais foram preservadas.";
    };
    const form = document.getElementById("colab-form");
    form.onsubmit = (event) => {
      event.preventDefault();
      const mensagem = document.getElementById("colab-form-mensagem");
      mensagem.textContent = "";
      if (!form.reportValidity()) return;
      const nome = document.getElementById("colab-nome").value.trim();
      const cargo = document.getElementById("colab-cargo").value.trim();
      if (!nome || !cargo) {
        mensagem.textContent = "Preencha nome e cargo / função.";
        return;
      }
      try {
        Object.assign(
          state,
          prepararImportacao(
            state,
            [
              {
                nome,
                cargo,
                sexo: document.getElementById("colab-sexo").value,
                horasSemana: Number(
                  document.getElementById("colab-horas").value,
                ),
              },
            ],
            "adicionar",
          ),
        );
      } catch (error) {
        mensagem.textContent = error.message;
        return;
      }
      invalidarEscala();
      renderColaboradores();
      renderResumo();
      const salvo = saveState();
      form.reset();
      mostrarColaboradores(
        document,
        salvo === false
          ? "Colaborador cadastrado nesta aba, mas não foi possível salvar no navegador. Exporte os dados antes de sair."
          : "Colaborador cadastrado. Confira seus dados na lista abaixo.",
      );
    };
  }
}
