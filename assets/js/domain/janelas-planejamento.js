import { limiteDiarioPlanejado, referenciaDia } from "./ec141.js";
import { normalizarJornada, timeToMin } from "./datas-horas.js";
import { janelaPermitida } from "./restricoes.js";
import { habilitadoPara } from "./funcoes.js";

export const planejamento5x2 = c => !!c.aplicarProposta5x2;

/** Horário de funcionamento da empresa no dia (aba Jornada), limite rígido
 * de entrada e saída, unido aos turnos individuais cadastrados. */
export function funcionamentoDoDia(config, weekday) {
  // A configuração individual (perfil) guarda a Jornada da empresa à parte.
  const origem = config.funcionamentoEmpresa || config;
  const geral = normalizarJornada(origem.horarioPorDia ? origem.jornadaPorDia?.[weekday] || origem.jornada : origem.jornada);
  // Turnos individuais cadastrados (ex.: quadro da Domínio) mostram que a empresa
  // também está aberta nesses horários: o funcionamento é a união dos dois.
  let entrada = geral?.entrada, saida = geral?.saida;
  for (const c of config.colaboradores || []) {
    const q = c.quadroDominio;
    if (!q || q.ativo === false || q.tipo === "ciclo") continue;
    const dia = q.semana?.[weekday];
    const j = dia?.status === "trabalho" ? normalizarJornada(dia.jornada) : null;
    if (!j) continue;
    entrada = entrada == null ? j.entrada : Math.min(entrada, j.entrada);
    saida = saida == null ? j.saida : Math.max(saida, j.saida);
  }
  return entrada == null ? null : { ...(geral || {}), entrada, saida };
}
/** Menor pausa usada para caber a jornada no funcionamento: a pausa preenchida
 * pode ser reduzida até 1h (art. 71 da CLT), nunca abaixo disso. */
export const pausaMinimaPlanejada = (intervalo) => (intervalo > 60 ? 60 : Math.max(0, intervalo || 0));

/** O quadro atual é referência; o funcionamento da empresa é limite rígido.
 * Para completar a carga diária autorizada, a pausa pode ser reduzida até 1h
 * em vez de estender a saída. Restrição individual explícita também limita. */
export function janelaPlanejada(config, colaborador, dia, fonte, explorar = false) {
  const j = normalizarJornada(fonte);
  if (!j) return null;
  let delta = dia.turno === "B" ? timeToMin(config.entradaTurnoB) - j.entrada : 0;
  // Horário importado em empresa com dois turnos: o Turno A começa na entrada da empresa.
  if (dia.turno === "A" && config.turnosRevezamento && config.perfilDominioId && config.funcionamentoEmpresa) {
    const e = config.funcionamentoEmpresa;
    const empresa = normalizarJornada(e.horarioPorDia ? e.jornadaPorDia?.[dia.weekday] || e.jornada : e.jornada);
    if (empresa && Number.isFinite(empresa.entrada)) delta = empresa.entrada - j.entrada;
  }
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
    // O horário atual orienta, mas não limita a duração: a saída pode avançar até
    // a carga diária autorizada, sem ultrapassar o funcionamento da empresa.
    // No Turno B, o funcionamento é definido pelo próprio revezamento declarado.
    fim = Math.max(fim, inicio + Math.round(limiteDiarioPlanejado(config, dia.data, colaborador) * 60) + j.intervalo);
    const funcionamento = deslocamento ? null : funcionamentoDoDia(config, dia.weekday);
    if (funcionamento) {
      // Jornada diária realmente necessária: carga da semana em cinco dias, até o limite diário.
      const semanal = Math.min(Number(colaborador?.horasSemana) || 0, referenciaDia(config, dia.data, colaborador).horas);
      const necessario = Math.round(Math.min(limiteDiarioPlanejado(config, dia.data, colaborador), semanal / 5) * 60) + pausaMinimaPlanejada(j.intervalo);
      inicio = Math.max(inicio, funcionamento.entrada);
      fim = Math.min(fim, funcionamento.saida);
      // Saída no fechamento: antecipa a entrada dentro do funcionamento.
      if (fim - inicio < necessario) inicio = Math.max(funcionamento.entrada, fim - necessario);
    }
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
