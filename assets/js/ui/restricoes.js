import { ajudaCampo } from "./ajuda-campo.js";
import { TIPOS_RESTRICAO, validarRestricoes } from "../domain/restricoes.js";
import { escapeHtml } from "../shared/formatacao.js";
const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const inputClass =
  "w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm bg-white";
const buttonClass =
  "px-3 py-2 rounded-md bg-fintria-navy text-white text-xs font-semibold";
const dataBR = (data) => data.split("-").reverse().join("/");
export function camposRestricoes(c) {
  const r = c.restricoes || {};
  const total =
    (r.periodos?.length || 0) +
    (r.diasIndisponiveis?.length || 0) +
    (r.folgasObrigatorias?.length || 0) +
    (r.horariosPermitidos?.length || 0);
  const periodos = (r.periodos || [])
    .map(
      (p, i) =>
        `<li class="restricao-item"><span>${escapeHtml(TIPOS_RESTRICAO[p.tipo] || p.tipo)} · ${escapeHtml(dataBR(p.inicio))} a ${escapeHtml(dataBR(p.fim))}</span><button type="button" data-restricao-remover="periodos" data-index="${i}" class="text-fintria-vermelho text-xs underline" aria-label="Remover período ${i + 1}">Remover</button></li>`,
    )
    .join("");
  const horarios = (r.horariosPermitidos || [])
    .map(
      (h, i) =>
        `<li class="restricao-item"><span>${DIAS[h.dia]} · ${escapeHtml(h.entrada)}–${escapeHtml(h.saida)}${h.saida < h.entrada ? " (saída no dia seguinte)" : ""}</span><button type="button" data-restricao-remover="horariosPermitidos" data-index="${i}" class="text-fintria-vermelho text-xs underline" aria-label="Remover horário ${DIAS[h.dia]}">Remover</button></li>`,
    )
    .join("");
  const dias = (campo) =>
    ORDEM.map(
      (d) =>
        `<label class="restricao-dia"><input type="checkbox" data-restricao-dias="${campo}" value="${d}" ${(r[campo] || []).includes(d) ? "checked" : ""}><span>${DIAS[d]}</span></label>`,
    ).join("");
  return `<details data-restricoes="${c.id}" class="md:col-span-5 border border-slate-200 rounded-lg bg-white">
  <summary class="cursor-pointer px-3 py-2 text-sm font-semibold text-fintria-navy">Restrições individuais <span class="font-normal text-slate-500">· ${total ? `${total} condição(ões)` : "opcional"}</span></summary>
  <div class="p-3 border-t border-slate-100 space-y-4">
    <div class="text-xs flex items-center gap-2">Como aplicar as restrições ${ajudaCampo(`restricoes-${c.id}`, "Restrições individuais", "Informe apenas as condições deste colaborador. Datas incluem o primeiro e o último dia; períodos e dias bloqueados também impedem plantões iniciados na véspera que avancem sobre eles. Estas condições valem na escala atual e na proposta, nas datas correspondentes.")}</div>
    <div class="restricao-bloco"><h4 class="font-semibold text-sm text-fintria-navy">Férias, afastamentos e bloqueios por período ${ajudaCampo(`periodos-${c.id}`, "Férias e afastamentos", "Férias e afastamentos retiram da meta de alocação apenas as horas originalmente previstas no período, sem compensação automática. Esta informação não calcula remuneração ou benefícios.")}</h4>
      <form data-restricao-form="periodo" class="restricao-form">
      <label class="text-xs font-semibold">Tipo<select name="tipo" class="${inputClass}">${Object.entries(
        TIPOS_RESTRICAO,
      )
        .map(([v, l]) => `<option value="${v}">${l}</option>`)
        .join("")}</select></label>
      <label class="text-xs font-semibold">De<input name="inicio" type="date" required class="${inputClass}"></label><label class="text-xs font-semibold">Até<input name="fim" type="date" required class="${inputClass}"></label><button type="submit" class="${buttonClass}">Adicionar período</button>
      </form>
      <ul data-restricoes-periodos class="mt-2 text-xs">${periodos || '<li class="text-slate-500">Nenhum período informado.</li>'}</ul>
    </div>
    <div class="restricao-bloco"><h4 class="font-semibold text-sm text-fintria-navy">Dias da semana indisponíveis</h4><p class="text-xs text-slate-500 mb-2">Não alocar trabalho nestes dias. A indisponibilidade não gera abono de horas.</p><div class="restricao-dias">${dias("diasIndisponiveis")}</div></div>
    <div class="restricao-bloco"><h4 class="font-semibold text-sm text-fintria-navy">Folgas obrigatórias toda semana ${ajudaCampo(`folgas-${c.id}`, "Folgas obrigatórias", "Usadas antes de distribuir as demais folgas. Se as condições exigirem mais dias sem trabalho do que o modelo permite, a escala apontará o conflito.")}</h4><div class="restricao-dias">${dias("folgasObrigatorias")}</div></div>
    <div class="restricao-bloco"><h4 class="font-semibold text-sm text-fintria-navy">Horários permitidos ${ajudaCampo(`permitidos-${c.id}`, "Horários permitidos", "Opcional: uma janela por dia da semana. Dias sem janela mantêm o horário configurado. O trabalho é limitado à interseção com o expediente, sem ampliar a saída ou mover o intervalo. Plantões 12×36 incompatíveis são retirados inteiros, sem mudar a referência do ciclo.")}</h4>
      <form data-restricao-form="horario" class="restricao-form"><label class="text-xs font-semibold">Dia<select name="dia" class="${inputClass}">${ORDEM.map((d) => `<option value="${d}">${DIAS[d]}</option>`).join("")}</select></label><label class="text-xs font-semibold">A partir de<input name="entrada" type="time" required class="${inputClass}"></label><label class="text-xs font-semibold">Até<input name="saida" type="time" required class="${inputClass}"></label><button type="submit" class="${buttonClass}">Salvar horário</button></form>
      <ul data-restricoes-horarios class="mt-2 text-xs">${horarios || '<li class="text-slate-500">Nenhuma janela adicional.</li>'}</ul>
    </div>
    <p data-restricoes-mensagem role="status" aria-live="polite" class="text-xs text-fintria-vermelho"></p>
  </div></details>`;
}
export function bindRestricoes({ list, state, onChange, render }) {
  for (const details of list.querySelectorAll("[data-restricoes]")) {
    const c = state.colaboradores.find(
      (c) => String(c.id) === details.dataset.restricoes,
    );
    function salvar(mutacao) {
      const next = structuredClone(
        c.restricoes || {
          periodos: [],
          diasIndisponiveis: [],
          folgasObrigatorias: [],
          horariosPermitidos: [],
        },
      );
      mutacao(next);
      const erros = validarRestricoes({ ...c, restricoes: next });
      if (erros.length) {
        details.querySelector("[data-restricoes-mensagem]").textContent =
          erros.join(" ");
        return;
      }
      const ativo = details.ownerDocument.activeElement;
      const foco = ativo?.dataset.restricaoDias
        ? `[data-restricao-dias="${ativo.dataset.restricaoDias}"][value="${ativo.value}"]`
        : ativo?.closest("form")
          ? `[data-restricao-form="${ativo.closest("form").dataset.restricaoForm}"] button[type="submit"]`
          : "summary";
      c.restricoes = next;
      onChange();
      render();
      list
        .querySelector(`[data-restricoes="${c.id}"] ${foco}`)
        ?.focus({ preventScroll: true });
    }
    for (const form of details.querySelectorAll("[data-restricao-form]"))
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const values = new FormData(form);
        if (form.dataset.restricaoForm === "periodo")
          salvar((r) => {
            r.periodos ??= [];
            r.periodos.push({
              tipo: values.get("tipo"),
              inicio: values.get("inicio"),
              fim: values.get("fim"),
            });
          });
        else
          salvar((r) => {
            r.horariosPermitidos ??= [];
            const dia = Number(values.get("dia"));
            r.horariosPermitidos = r.horariosPermitidos.filter(
              (h) => h.dia !== dia,
            );
            r.horariosPermitidos.push({
              dia,
              entrada: values.get("entrada"),
              saida: values.get("saida"),
            });
          });
      };
    for (const el of details.querySelectorAll("[data-restricao-dias]"))
      el.onchange = () =>
        salvar((r) => {
          const campo = el.dataset.restricaoDias;
          r[campo] = [
            ...details.querySelectorAll(
              `[data-restricao-dias="${campo}"]:checked`,
            ),
          ].map((el) => Number(el.value));
        });
    for (const btn of details.querySelectorAll("[data-restricao-remover]"))
      btn.onclick = () =>
        salvar((r) =>
          r[btn.dataset.restricaoRemover].splice(Number(btn.dataset.index), 1),
        );
  }
}
