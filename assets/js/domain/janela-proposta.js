import { normalizarJornada, minToTime } from "./datas-horas.js";
import { janelaPlanejada, planejamento5x2 } from "./janelas-planejamento.js";
import { referenciaDia } from "./ec141.js";

/** Ajusta a janela antes de repartir horas; recortar só depois perde carga que
 * poderia ser alocada nos outros dias. Mantém a duração do intervalo declarado. */
export function janelaDaProposta(config, colaborador, dia, fonte) {
  let j = normalizarJornada(fonte);
  if (!j) return fonte;
  // Carga abaixo de 44h mantida em cinco dias: quem hoje trabalha sem intervalo (até 4h
  // por dia) precisa de mais horas por dia. Acima de 4h, a lei exige 15 min de pausa
  // (art. 71, § 1º, da CLT) e, acima de 6h, 1h. A pausa é prevista para não reduzir a carga.
  if (!j.intervalo && planejamento5x2(config) && Number(colaborador?.horasSemana) < 44) {
    const semanal = Math.min(Number(colaborador?.horasSemana) || 0, referenciaDia(config, dia.data, colaborador).horas);
    const porDia = (semanal / 5) * 60;
    const aberto = janelaPlanejada(config, colaborador, dia, fonte);
    if (porDia > 240.5 && aberto && aberto.fim - aberto.inicio > 255) {
      const duracao = porDia > 360 ? 60 : 15;
      const inicio = Math.round((j.entrada + Math.min(porDia, j.saida - j.entrada) / 2) / 5) * 5;
      fonte = { ...fonte, intInicio: minToTime(inicio), intFim: minToTime(inicio + duracao) };
      j = normalizarJornada(fonte);
    }
  }
  const janela = janelaPlanejada(config, colaborador, dia, fonte);
  if (!janela) return fonte;
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
