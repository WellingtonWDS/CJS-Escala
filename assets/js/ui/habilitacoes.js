import { funcoesHabilitadas, normalizarFuncao } from "../domain/funcoes.js";
import { escapeHtml } from "../shared/formatacao.js";
export function camposHabilitacoes(c, pessoas) {
  const mapa = new Map();
  for (const p of pessoas)
    for (const nome of funcoesHabilitadas(p))
      mapa.set(normalizarFuncao(nome), nome);
  const extras = [...mapa.values()].filter(
    (n) => normalizarFuncao(n) !== normalizarFuncao(c.cargo),
  );
  const salvos = funcoesHabilitadas(c).map(normalizarFuncao);
  return `<details data-habilitacoes="${c.id}" class="md:col-span-5 border border-slate-200 rounded-lg bg-white"><summary class="px-3 py-2 text-sm font-semibold cursor-pointer text-fintria-navy">Funções habilitadas para cobertura <span class="font-normal text-slate-500">· opcional</span></summary><div class="p-3 border-t border-slate-100"><p class="text-xs text-slate-500 mb-2">A função principal (${escapeHtml(c.cargo || "preencha o cargo")}) já está habilitada. Marque outras funções que esta pessoa pode exercer. Uma sugestão pode realocá-la para uma delas no dia, sem contar a mesma pessoa em duas funções ao mesmo tempo.</p><div class="restricao-dias">${extras.map((n) => `<label class="restricao-dia"><input type="checkbox" data-habilitacao="${c.id}" value="${escapeHtml(n)}" ${salvos.includes(normalizarFuncao(n)) ? "checked" : ""}><span>${escapeHtml(n)}</span></label>`).join("") || '<p class="text-xs text-slate-500">Cadastre outros cargos nos colaboradores para disponibilizar funções adicionais.</p>'}</div></div></details>`;
}
export function bindHabilitacoes({ list, state, onChange }) {
  for (const el of list.querySelectorAll("[data-habilitacao]"))
    el.onchange = () => {
      const c = state.colaboradores.find(
        (c) => String(c.id) === el.dataset.habilitacao,
      );
      if (!c) return;
      c.funcoesHabilitadas = [
        ...list.querySelectorAll(`[data-habilitacao="${c.id}"]:checked`),
      ].map((el) => el.value);
      onChange();
    };
}
