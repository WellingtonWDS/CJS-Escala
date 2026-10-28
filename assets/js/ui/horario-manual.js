import { getDialogs } from "./dialogs.js";
import { validarHorarioManual } from "../domain/horario-manual.js";
import { minToTime, normalizarJornada } from "../domain/datas-horas.js";

export function editarHorario(env, dia, jornada) {
  const trabalho = ["T", "FE"].includes(dia.status) && dia.horas > 0;
  const valores = trabalho ? {
    entrada: minToTime(dia.entradaMin), saida: minToTime(dia.saidaMin),
    intInicio: dia.intervaloInicioMin != null ? minToTime(dia.intervaloInicioMin) : "",
    intFim: dia.intervaloFimMin != null ? minToTime(dia.intervaloFimMin) : "",
  } : { ...jornada };
  // Horários antigos de meio período são apresentados como entrada/saída.
  if (!trabalho) {
    const j = normalizarJornada(dia.jornadaAplicada || jornada);
    const delta = j && Number.isFinite(dia.entradaMin) ? dia.entradaMin - j.entrada : 0;
    if (j) Object.assign(valores, { entrada: minToTime(j.entrada + delta), saida: minToTime(j.saida + delta),
      intInicio: j.intervalo ? minToTime(j.intInicio + delta) : "", intFim: j.intervalo ? minToTime(j.intFim + delta) : "" });
  }
  return getDialogs(env.document).form(
    "Horários de trabalho neste dia. Sem intervalo, deixe início e fim vazios. Saída anterior à entrada indica término no dia seguinte.",
    valores,
    { title: "Editar horários de trabalho", confirmText: "Salvar horários", fields: [
      { name: "entrada", label: "Entrada", type: "time", required: true },
      { name: "intInicio", label: "Início do intervalo (opcional)", type: "time" },
      { name: "intFim", label: "Fim do intervalo (opcional)", type: "time" },
      { name: "saida", label: "Saída", type: "time", required: true },
    ], validate: validarHorarioManual },
  );
}
