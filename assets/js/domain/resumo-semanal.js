import { distribuirCargaComAbonos } from "./distribuicao-horas.js";
import { intervaloMin } from "./datas-horas.js";

/** Feriado dispensado abona apenas o trabalho originalmente previsto.
 * Crédito é separado de horas trabalhadas, presença e limites de trabalho. */
export function apurarSemana(colaborador, dias, config = {}) {
  const cargaPrevista = distribuirCargaComAbonos(colaborador, dias, config);
  const alvo = Number(colaborador.horasSemana);
  const horasPadrao =
    config.tipoEscala === "12x36"
      ? Math.max(0, 12 - Math.max(0, intervaloMin(config.jornada) || 0) / 60)
      : 0;
  const abonos = dias
    .filter(
      (d) =>
        d.previsto === true &&
        d.status === "F" &&
        d.feriado &&
        !d.feriado.trabalhado,
    )
    .map((d) => ({
      data: d.data,
      nome: d.feriado.nome,
      horas: Number.isFinite(d.horasPrevistas)
        ? Math.max(0, d.horasPrevistas)
        : config.tipoEscala === "12x36"
          ? horasPadrao
          : (cargaPrevista.get(d.data) ?? 0),
    }))
    .filter((a) => a.horas > 0);
  const trabalhadas = dias
    .filter((d) => d.status === "T" || d.status === "FE")
    .reduce((s, d) => s + d.horas, 0);
  const abonadas = abonos.reduce((s, a) => s + a.horas, 0);
  const computadas = trabalhadas + abonadas;
  const completa = dias.length === 7;
  const estado =
    !completa || !Number.isFinite(alvo)
      ? "parcial"
      : Math.abs(computadas - alvo) < 0.01
        ? "ok"
        : computadas > alvo
          ? "acima"
          : "abaixo";
  return { trabalhadas, abonadas, computadas, abonos, alvo, completa, estado };
}
