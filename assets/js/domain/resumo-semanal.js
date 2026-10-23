import { ausenciaProgramada, metaComAusencias } from "./restricoes.js";
import { referenciaSemana } from "./ec141.js";
import { distribuirCargaComAbonos } from "./distribuicao-horas.js";
import { intervaloMin } from "./datas-horas.js";
import { configDoPerfil } from "./perfil-dominio.js";

/** Feriado dispensado abona apenas o trabalho originalmente previsto.
 * Crédito é separado de horas trabalhadas, presença e limites de trabalho. */
export function apurarSemana(colaborador, dias, config = {}) {
  const individual = configDoPerfil(config, colaborador);
  if (individual) return apurarSemana(colaborador, dias, individual);
  if (dias.some((d) => d.status === "NC"))
    return apurarSemana(
      colaborador,
      dias.filter((d) => d.status !== "NC"),
      config,
    );
  const contrato = Number(colaborador.horasSemana);
  const alvoOriginal = config.ano
    ? referenciaSemana(config, dias, colaborador).alvo
    : contrato;
  const { dispensadas, alvo, semDiasAlocaveis } = metaComAusencias(
    dias,
    alvoOriginal,
  );
  const cargaPrevista = distribuirCargaComAbonos(
    { ...colaborador, horasSemana: alvo },
    dias,
    config,
  );
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
  const creditosIntervalo = dias.reduce(
    (s, d) =>
      s + (["T", "FE"].includes(d.status) ? d.creditoIntervaloCCT || 0 : 0),
    0,
  );
  const creditosNoturnos = dias.reduce(
    (s, d) =>
      s + (["T", "FE"].includes(d.status) ? d.creditoNoturnoCCT || 0 : 0),
    0,
  );
  const computadas =
    trabalhadas + abonadas + creditosIntervalo + creditosNoturnos;
  const completa = dias.length === 7;
  const estado =
    !completa || !Number.isFinite(alvo)
      ? "parcial"
      : Math.abs(computadas - alvo) < 0.01
        ? "ok"
        : computadas > alvo
          ? "acima"
          : "abaixo";
  return {
    trabalhadas,
    dispensadas,
    semDiasAlocaveis,
    alvoOriginal,
    ausencias: dias.filter(ausenciaProgramada).map((d) => ({
      data: d.data,
      descricao:
        d.restricao?.descricao ||
        (d.status === "VA" ? "Férias" : "Afastamento"),
    })),
    creditosIntervalo,
    creditosNoturnos,
    abonadas,
    computadas,
    abonos,
    alvo,
    contrato,
    completa,
    estado,
  };
}
