import { normalizarJornada, minToTime, timeToMin } from "./datas-horas.js";
import { janelaPermitida } from "./restricoes.js";

/** Ajusta a janela antes de repartir horas; recortar só depois perde carga que
 * poderia ser alocada nos outros dias. Mantém a duração do intervalo declarado. */
export function janelaDaProposta(config, colaborador, dia, fonte) {
  const j = normalizarJornada(fonte);
  if (!j) return fonte;
  const delta = dia.turno === "B" ? timeToMin(config.entradaTurnoB) - j.entrada : 0;
  const deslocamento = Number.isFinite(delta) ? delta : 0;
  const janela = janelaPermitida(colaborador, dia);
  const entrada = Math.max(j.entrada + deslocamento, janela?.inicio ?? -Infinity);
  const saida = Math.min(j.saida + deslocamento, janela?.fim ?? Infinity);
  if (saida - entrada <= j.intervalo) {
    const inicio = minToTime(j.entrada + deslocamento);
    return { entrada: inicio, saida: inicio, intInicio: "", intFim: "" };
  }
  const margem = Math.min(15, (saida - entrada - j.intervalo) / 2);
  const pausa = Math.max(entrada + margem, Math.min(j.intInicio + deslocamento, saida - j.intervalo - margem));
  return { entrada: minToTime(entrada), saida: minToTime(saida),
    intInicio: j.intervalo ? minToTime(pausa) : "",
    intFim: j.intervalo ? minToTime(pausa + j.intervalo) : "" };
}
