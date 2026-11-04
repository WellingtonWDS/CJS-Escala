import { normalizarJornada, minToTime } from "./datas-horas.js";
import { janelaPlanejada } from "./janelas-planejamento.js";

/** Ajusta a janela antes de repartir horas; recortar só depois perde carga que
 * poderia ser alocada nos outros dias. Mantém a duração do intervalo declarado. */
export function janelaDaProposta(config, colaborador, dia, fonte) {
  const j = normalizarJornada(fonte);
  if (!j) return fonte;
  const janela = janelaPlanejada(config, colaborador, dia, fonte);
  const entrada = janela.inicio, saida = janela.fim;
  if (saida - entrada <= j.intervalo) {
    const inicio = minToTime(entrada);
    return { entrada: inicio, saida: inicio, intInicio: "", intFim: "" };
  }
  const margem = Math.min(15, (saida - entrada - j.intervalo) / 2);
  const pausa = Math.max(entrada + margem, Math.min(janela.pausa, saida - j.intervalo - margem));
  return { entrada: minToTime(entrada), saida: minToTime(saida),
    intInicio: j.intervalo ? minToTime(pausa) : "",
    intFim: j.intervalo ? minToTime(pausa + j.intervalo) : "" };
}
