import { getMonday, addDays, isoDate } from "./datas-horas.js";

/** Feriados dispensados ocupam as vagas de repouso antes das folgas opcionais.
 * A grade continua identificando o trabalho originalmente previsto para abono. */
export function createPlanejadorFolgas(
  state,
  escolherBase,
  feriadosMap,
  indice,
) {
  const cache = new Map();
  const ordem = (dia) => (dia + 6) % 7;
  const chave = (date) =>
    isoDate(date.getFullYear(), date.getMonth(), date.getDate());
  function bruto(segunda) {
    const base = escolherBase(segunda, indice);
    const operacionais = [...new Set(state.diasTrabalho)];
    const obrigatorias = [];
    const feriados = [];
    for (let i = 0; i < 7; i++) {
      const dia = addDays(segunda, i);
      const f = feriadosMap[chave(dia)];
      if (f && !f.trabalhado) feriados.push(dia.getDay());
      if (!operacionais.includes(dia.getDay()) || (f && !f.trabalhado))
        obrigatorias.push(dia.getDay());
    }
    if (state.tipoEscala === "5x2" && state.folgasFimSemana) {
      return {
        base,
        opcionais: base,
        obrigatorias: [...new Set([...obrigatorias, 0, 6])],
      };
    }
    if (!["5x2", "6x1"].includes(state.tipoEscala))
      return { base, opcionais: base, obrigatorias };
    const alvo = state.tipoEscala === "5x2" ? 2 : 1;
    const quantidade = Math.max(0, alvo - obrigatorias.length);
    const restantes = base.filter((d) => !obrigatorias.includes(d));
    // Manter a última folga nominal ajuda a proteger a passagem entre semanas.
    if (operacionais.length === 7 && feriados.length)
      restantes.sort((a, b) => ordem(b) - ordem(a));
    const permitidos = (state.folgaDiasPermitidos || []).filter((d) =>
      operacionais.includes(d),
    );
    const candidatos = permitidos.length ? permitidos : operacionais;
    const opcoes = [...new Set([...restantes, ...candidatos])].filter(
      (d) => !obrigatorias.includes(d),
    );
    return { base, obrigatorias, opcionais: opcoes.slice(0, quantidade) };
  }
  function planejar(date) {
    const segunda = getMonday(date);
    const key = chave(segunda);
    if (cache.has(key)) return cache.get(key);
    const plano = bruto(segunda);
    // Um dia fechado fixo já interrompe qualquer sequência semanal de trabalho.
    if (
      state.tipoEscala === "5x2" &&
      !state.folgasFimSemana &&
      new Set(state.diasTrabalho).size === 7 &&
      plano.opcionais.length
    ) {
      const anteriorData = addDays(segunda, -7);
      let anterior = bruto(anteriorData);
      // Duas folgas opcionais preservam a última; nenhuma mantém os dias
      // obrigatórios. Só uma folga opcional pode alterar a última posição.
      if (anterior.obrigatorias.length && anterior.opcionais.length === 1)
        anterior = planejar(anteriorData);
      const repousosAnteriores = [
        ...anterior.obrigatorias,
        ...anterior.opcionais,
      ];
      const limite = Math.max(...repousosAnteriores.map(ordem));
      const repousos = [...plano.obrigatorias, ...plano.opcionais];
      if (Math.min(...repousos.map(ordem)) > limite) {
        const permitidos = (state.folgaDiasPermitidos || []).filter((d) =>
          state.diasTrabalho.includes(d),
        );
        const candidatos = (permitidos.length ? permitidos : state.diasTrabalho)
          .filter((d) => !plano.obrigatorias.includes(d) && ordem(d) <= limite)
          .sort((a, b) => ordem(b) - ordem(a));
        if (candidatos.length) {
          const primeira = plano.opcionais.reduce((a, b) =>
            ordem(a) < ordem(b) ? a : b,
          );
          plano.opcionais = plano.opcionais.map((d) =>
            d === primeira ? candidatos[0] : d,
          );
        }
      }
    }
    cache.set(key, plano);
    return plano;
  }
  return planejar;
}
