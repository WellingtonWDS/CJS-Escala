/* Revezamento quinzenal do sábado (proposta 5×2). Em semanas alternadas, cada
 * colaborador trabalha de segunda a sexta (folga no sábado) ou trabalha no sábado e
 * folga em um dia útil. O sábado costuma ter funcionamento reduzido: a semana com
 * sábado fica abaixo do alvo semanal, sem redução salarial nem da carga contratual
 * (art. 2º da EC 141). Essa diferença não é tratada como falta a corrigir. */
import { dateFromKey, getMonday, timeToMin, minToTime } from "./datas-horas.js";

const trabalha = (d) => ["T", "FE"].includes(d.status);
export const revezamentoQuinzenal = (config) => !!config?.folgasQuinzenal;

/** Semana (lista de dias) em que o colaborador trabalha no sábado do revezamento. */
export function semanaComSabadoQuinzenal(config, dias) {
  return revezamentoQuinzenal(config) && dias.some((d) => d.weekday === 6 && trabalha(d));
}

/** Plano da semana: folgas da semana com sábado ou da semana de segunda a sexta. */
export function folgasDoPlanoQuinzenal(plano, segunda) {
  const serial = Math.floor(Date.UTC(segunda.getFullYear(), segunda.getMonth(), segunda.getDate()) / 86400000 / 7);
  return (serial + plano.fase) % 2 === 0 ? plano.comSabado : plano.semSabado;
}
export const ehPlanoQuinzenal = (p) => !!p && !Array.isArray(p) && p.quinzenal === true;

/** Planos possíveis: dia útil de folga na semana com sábado × fase (qual semana). */
export function planosQuinzenais(planosSemanais) {
  const uteis = [...new Set(planosSemanais.filter((p) => p.length === 1 && p[0] >= 1 && p[0] <= 5).map((p) => p[0]))];
  return uteis.flatMap((dia) => [0, 1].map((fase) => ({ quinzenal: true, semSabado: [6], comSabado: [dia], fase })));
}

/** Motivo para a opção não se aplicar à configuração, ou "" quando se aplica. */
export function motivoSemQuinzenal(config) {
  if (config.modeloEscala === "fixa") return "O revezamento quinzenal alterna duas semanas diferentes; use a escala mensal dinâmica.";
  const dias = config.diasTrabalho || [];
  if (!dias.includes(6)) return "O revezamento quinzenal do sábado exige que a empresa funcione aos sábados.";
  if (dias.includes(0)) return "O revezamento quinzenal do sábado está disponível para empresas que não funcionam aos domingos.";
  if (![1, 2, 3, 4, 5].every((d) => dias.includes(d))) return "O revezamento quinzenal do sábado exige funcionamento de segunda a sábado.";
  return "";
}
export const semanaDe = (data) => getMonday(dateFromKey(data));

/** Sábado sem intervalo e com mais de 4h15 de funcionamento recebe 15 min de intervalo
 * no meio do período, para permitir até 6h de trabalho. */
export function sabadoComIntervalo(jornada, empresa = null) {
  if (!jornada || jornada.intInicio) return jornada;
  // Perfil individual (ex.: 10h–14h): o período de referência é o funcionamento da empresa.
  const base = empresa?.entrada && empresa?.saida ? empresa : jornada;
  const entrada = timeToMin(base.entrada);
  let saida = timeToMin(base.saida);
  if (!Number.isFinite(entrada) || !Number.isFinite(saida)) return jornada;
  if (saida <= entrada) saida += 1440;
  if (saida - entrada <= 255) return jornada;
  const inicio = Math.round((entrada + (saida - entrada - 15) / 2) / 5) * 5;
  return { ...jornada, entrada: base.entrada, saida: base.saida, intInicio: minToTime(inicio), intFim: minToTime(inicio + 15) };
}
