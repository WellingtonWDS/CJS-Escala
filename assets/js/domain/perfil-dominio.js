import { normalizarJornada, minToTime, dateFromKey } from "./datas-horas.js";
import { limiteDiario, dataValida } from "./ec141.js";
export function perfilAtivo(c) {
  return c?.quadroDominio && c.quadroDominio.ativo !== false;
}
export function verificarPerfil(c) {
  const p = c.quadroDominio;
  if (!perfilAtivo(c)) return;
  const dias = Object.values(p.tipo === "ciclo" ? p.ciclo : p.semana);
  if (
    !dias.length ||
    dias.some(
      (h) =>
        !["folga", "trabalho"].includes(h.status) ||
        (h.status === "trabalho" && !normalizarJornada(h.jornada)),
    )
  )
    throw new Error(
      `${c.nome}: revise os dias e horários não informados no cadastro importado.`,
    );
  if (!Number.isFinite(c.horasSemana) || c.horasSemana <= 0)
    throw new Error(`${c.nome}: informe a carga de referência no cadastro.`);
  if (p.tipo === "ciclo" && !dataValida(p.ancora))
    throw new Error(
      `${c.nome}: informe uma data válida para o 1º dia do ciclo.`,
    );
}
export function limitarJornada(fonte, limite) {
  const j = normalizarJornada(fonte);
  if (!j) return fonte;
  const horas = Math.min(limite, (j.saida - j.entrada - j.intervalo) / 60),
    fim = j.entrada + horas * 60 + j.intervalo;
  const pausa = Math.min(j.intInicio, fim - j.intervalo);
  return {
    ...fonte,
    intInicio: minToTime(j.turnoUnico ? fim : pausa),
    intFim: minToTime(j.turnoUnico ? fim : pausa + j.intervalo),
    saida: minToTime(fim),
  };
}
export function configDoPerfil(state, c) {
  if (!perfilAtivo(c) || state.perfilDominioId === c.id) return null;
  const p = c.quadroDominio,
    proposta = !!state.aplicarProposta5x2;
  const fonte =
    Object.values(p.tipo === "ciclo" ? p.ciclo : p.semana).find(
      (h) => h.status === "trabalho",
    )?.jornada || state.jornada;
  const normal = normalizarJornada(fonte);
  const plantao12 =
    p.tipo === "ciclo" &&
    Object.keys(p.ciclo).length === 2 &&
    p.ciclo[1]?.status === "trabalho" &&
    p.ciclo[2]?.status === "folga" &&
    normal?.saida - normal?.entrada === 720;
  const tipo = proposta
    ? "5x2"
    : p.tipo === "ciclo"
      ? plantao12
        ? "12x36"
        : "custom"
      : p.modelo;
  const config = {
    ...state,
    perfilDominioId: c.id,
    tipoEscala: tipo,
    jornada: fonte,
    jornadaPorDia: {},
    horarioPorDia: true,
    turnosRevezamento: false,
    folgasFimSemana: proposta ? state.folgasFimSemana : false,
    folgaTipo: "fixa",
    usarHorasQuadro: !proposta,
  };
  const dias = Object.entries(p.semana)
    .filter(([, h]) => h.status === "trabalho")
    .map(([d]) => Number(d));
  config.diasTrabalho = p.tipo === "ciclo" ? [0, 1, 2, 3, 4, 5, 6] : dias;
  config.folgaDiasPermitidos = proposta
    ? state.folgaDiasPermitidos
    : [0, 1, 2, 3, 4, 5, 6].filter((d) => !dias.includes(d));
  let limite = 8;
  if (proposta) {
    const total = new Date(state.ano, state.mes + 1, 0).getDate();
    limite = Math.min(
      ...Array.from({ length: total }, (_, i) =>
        limiteDiario(
          state,
          `${state.ano}-${String(state.mes + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
        ),
      ),
    );
  }
  for (const [d, h] of Object.entries(p.semana))
    if (h.status === "trabalho")
      config.jornadaPorDia[d] = proposta
        ? limitarJornada(h.jornada, limite)
        : h.jornada;
  if (p.tipo === "ciclo" && !proposta)
    config.cicloQuadro = { dias: p.ciclo, ancora: p.ancora };
  if (plantao12) {
    config.ancora12x36 = p.ancora;
    config.horarioPorDia = false;
  }
  return config;
}
export function diaDoCiclo(config, date) {
  const ciclo = config.cicloQuadro;
  const anchor = dateFromKey(ciclo.ancora);
  const serial = (d) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const n = Object.keys(ciclo.dias).length;
  const idx = ((((serial(date) - serial(anchor)) % n) + n) % n) + 1;
  return ciclo.dias[idx];
}
