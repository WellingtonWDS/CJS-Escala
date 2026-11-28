/* Folga consecutiva periódica (proposta 5×2). Com o domingo como folga fixa (empresa
 * fechada aos domingos), a cada N meses cada colaborador tem a segunda folga colada ao
 * domingo: no sábado (sábado e domingo) ou na segunda (domingo e segunda). Em cada mês,
 * 1/N de cada função recebe a folga consecutiva; o grupo muda no mês seguinte. */
import { normalizarFuncao } from "./funcoes.js";

export const OPCOES_CONSECUTIVA = [0, 2, 3];

export function motivoSemConsecutiva(config) {
  if (config.modeloEscala === "fixa") return "A folga consecutiva periódica muda de um mês para outro; use a escala mensal dinâmica.";
  if ((config.diasTrabalho || []).includes(0)) return "A folga consecutiva periódica considera o domingo como folga fixa; disponível quando a empresa não funciona aos domingos.";
  return "";
}

/** Colaboradores com folga consecutiva no mês: rodízio dentro de cada função. */
export function consecutivosNoMes(colaboradores, ano, mes, cadaMeses) {
  if (!cadaMeses) return new Set();
  const porFuncao = new Map(), ids = new Set(), serial = ano * 12 + mes;
  for (const c of colaboradores) {
    const f = normalizarFuncao(c.cargo);
    porFuncao.set(f, [...(porFuncao.get(f) || []), c]);
  }
  for (const grupo of porFuncao.values())
    grupo.forEach((c, i) => { if ((i + serial) % cadaMeses === 0) ids.add(c.id); });
  return ids;
}

/** Planos em que a segunda folga fica colada ao domingo (sábado ou segunda). */
export function planosConsecutivos(planos) {
  return planos.filter((p) => Array.isArray(p)
    ? p.length === 1 && [1, 6].includes(p[0])
    : p?.quinzenal && p.comSabado?.length === 1 && p.comSabado[0] === 1);
}
