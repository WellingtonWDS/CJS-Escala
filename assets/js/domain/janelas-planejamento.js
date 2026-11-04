import { normalizarJornada, timeToMin } from "./datas-horas.js";
import { limiteDiario } from "./ec141.js";
import { janelaPermitida } from "./restricoes.js";
import { habilitadoPara } from "./funcoes.js";

export const planejamento5x2 = c => !!c.aplicarProposta5x2;

/** O quadro atual é referência, não indisponibilidade. A janela de busca pode
 * crescer; a duração efetiva continua limitada pelo ACT/CCT, carga e descanso.
 * Só a restrição individual explícita impõe um limite rígido ao novo horário. */
export function janelaPlanejada(config, colaborador, dia, fonte, explorar = false) {
  const j = normalizarJornada(fonte);
  if (!j) return null;
  const delta = dia.turno === "B" ? timeToMin(config.entradaTurnoB) - j.entrada : 0;
  const deslocamento = Number.isFinite(delta) ? delta : 0;
  let inicio = j.entrada + deslocamento, fim = j.saida + deslocamento;
  if (planejamento5x2(config)) {
    for (const d of explorar && config.coberturaAtiva ? config.demandasCobertura || [] : []) {
      if (!d.diasSemana?.includes(dia.weekday) || !habilitadoPara(colaborador, d.funcao)) continue;
      const a = timeToMin(d.inicio), b = timeToMin(d.fim);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      inicio = Math.min(inicio, a);
      fim = Math.max(fim, b + (b < a ? 1440 : 0));
    }
    // Não reduz automaticamente a duração da pausa preenchida. Quando necessário,
    // a nova saída é sugerida e exibida na grade para conferência do usuário.
    fim = Math.max(fim, inicio + Math.round(limiteDiario(config, dia.data) * 60) + j.intervalo);
  }
  const permitida = janelaPermitida(colaborador, dia);
  if (planejamento5x2(config) && permitida) {
    // A janela explícita é a disponibilidade nova, inclusive se estiver em
    // outro turno. Preserva a entrada atual somente quando ela ainda cabe.
    if (explorar || inicio < permitida.inicio || inicio + j.intervalo >= permitida.fim)
      inicio = permitida.inicio;
    fim = permitida.fim;
  }
  return { inicio: Math.max(0, inicio, permitida?.inicio ?? 0),
    fim: Math.min(fim, permitida?.fim ?? Infinity), intervalo: j.intervalo,
    pausa: j.intInicio + deslocamento };
}
