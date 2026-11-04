import { janelaPlanejada, planejamento5x2 } from "./janelas-planejamento.js";
import { configDoPerfil, perfilAtivo } from "./perfil-dominio.js";
import { bloqueioNaData, janelaPermitida } from "./restricoes.js";
import { normalizarJornada, timeToMin } from "./datas-horas.js";
/** Janelas declaradas; não são presença confirmada nem autorização de jornada. */
export function janelasDeclaradas(config, c, d) {
  const proprio = configDoPerfil(config, c) || config;
  if (
    proprio.tipoEscala === "12x36" ||
    proprio.cicloQuadro ||
    !proprio.diasTrabalho.includes(d.weekday) ||
    bloqueioNaData(c, d.data) ||
    (d.feriado && !d.feriado.trabalhado)
  )
    return [];
  const origem = config.horariosOrigemCobertura || config;
  const fonte = perfilAtivo(c)
    ? c.quadroDominio.semana?.[d.weekday]?.jornada
    : origem.horarioPorDia
      ? origem.jornadaPorDia?.[d.weekday] || origem.jornada
      : origem.jornada;
  if (planejamento5x2(config)) {
    const turnos = ["A", ...(!perfilAtivo(c) && origem.turnosRevezamento ? ["B"] : [])];
    return turnos.map(turno => janelaPlanejada(
      {...proprio, entradaTurnoB:origem.entradaTurnoB ?? proprio.entradaTurnoB},
      c, {...d,turno}, fonte || proprio.jornada, true,
    )).filter(j => j && j.fim > j.inicio);
  }
  const j = normalizarJornada(fonte);
  if (!j) return [];
  const opcoes = [{ inicio: j.entrada, fim: j.saida }];
  if (!perfilAtivo(c) && origem.turnosRevezamento) {
    const inicio = timeToMin(origem.entradaTurnoB);
    if (Number.isFinite(inicio))
      opcoes.push({ inicio, fim: inicio + j.saida - j.entrada });
  }
  const permitida = janelaPermitida(c, d);
  return opcoes
    .map((o) => ({
      inicio: Math.max(o.inicio, permitida?.inicio ?? o.inicio),
      fim: Math.min(o.fim, permitida?.fim ?? o.fim),
    }))
    .filter((o) => o.fim > o.inicio);
}
