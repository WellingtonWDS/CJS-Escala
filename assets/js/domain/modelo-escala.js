import { addDays, dateFromKey, getMonday, isoDate } from "./datas-horas.js";

export const escalaFixa = (config) => config.modeloEscala === "fixa";
export function dataReferenciaFixa(config) {
  const value = config.dataReferenciaFixa;
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dateFromKey(value) : null;
  if (!date || Number.isNaN(date.getTime()) ||
      isoDate(date.getFullYear(), date.getMonth(), date.getDate()) !== value ||
      date.getFullYear() < 2026 || date.getFullYear() > 2100)
    throw new Error("Informe uma data de referência válida para a escala fixa (2026 a 2100).");
  return value;
}

/** O calendário interno serve somente para verificar a repetição e seus descansos.
 * Não representa uma aplicação do padrão a datas reais. Nunca altera o cadastro. */
export function contextoModelo(config) {
  if (!escalaFixa(config) || config.contextoFixo) return config;
  const date = dateFromKey(dataReferenciaFixa(config));
  return {
    ...config,
    contextoFixo: true,
    ano: date.getFullYear(), mes: date.getMonth(), diaInicio: 1,
    folgaTipo: "fixa",
    colaboradores: config.colaboradores.map(colaboradorRecorrente),
  };
}

export function colaboradorRecorrente(colaborador) {
  return colaborador.restricoes?.periodos?.length
    ? { ...colaborador, restricoes: { ...colaborador.restricoes, periodos: [] } }
    : colaborador;
}

/** Uma semana completa, com o domingo anterior disponível no contexto noturno. */
export function periodoModelo(config) {
  config = contextoModelo(config);
  if (!escalaFixa(config)) return null;
  const primeira = new Date(config.ano, config.mes, 1);
  let inicio = getMonday(primeira);
  if (inicio < primeira) inicio = addDays(inicio, 7);
  const chave = (d) => isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  return { inicio: chave(inicio), fim: chave(addDays(inicio, 6)) };
}

export function diasDoModelo(config, dias) {
  const periodo = periodoModelo(config);
  return periodo ? dias.filter((d) => d.data >= periodo.inicio && d.data <= periodo.fim) : dias;
}

export function ocorrenciasDoModelo(config, issues) {
  if (!escalaFixa(config)) return issues;
  const vistas = new Set();
  return issues.filter((i) => {
    const texto = i.mensagem.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (data) => String(dateFromKey(data).getDay()));
    const key = `${i.tipo}/${i.severidade}/${texto}`;
    if (vistas.has(key)) return false;
    vistas.add(key); return true;
  });
}

export function conferirSuporteFixo(config) {
  if (!escalaFixa(config)) return;
  dataReferenciaFixa(config);
  if (config.tipoEscala === "12x36" || config.colaboradores.some(
    (c) => c.quadroDominio?.ativo !== false && c.quadroDominio?.tipo === "ciclo"))
    throw new Error("O ciclo 12×36 não se repete nos mesmos dias da semana. Utilize a escala mensal dinâmica para esses colaboradores.");
  const i = config.instrumentoColetivo || {};
  if (config.instrumentoCompensacao === "act_cct" && (i.repousoMensal || i.compensacaoHoras))
    throw new Error("Compensação de repousos ou apuração de horas por período exige datas reais. Utilize a escala mensal dinâmica ou revise as condições do ACT/CCT para um padrão semanal.");
}
