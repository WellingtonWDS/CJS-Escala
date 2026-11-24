import { ausenciaProgramada } from "./restricoes.js";
import { dataValida, instrumentoValido, referenciaDia } from "./ec141.js";
import { dateFromKey, isoDate, addDays } from "./datas-horas.js";
/** A apuração não presume que um instrumento válido autorize qualquer excesso.
 * Exige período completo, teto de pico e média efetiva, deixando a cláusula pendente. */
export function apurarCompensacaoHoras(state, c, dias) {
  const i = state.instrumentoColetivo || {};
  if (!i.compensacaoHoras) return { situacao: "nao_declarada", issues: [] };
  const issue = (tipo, severidade, mensagem) => ({
    tipo,
    severidade,
    mensagem,
    data: null,
  });
  const incompleta = (mensagem) => ({
    situacao: "incompleta",
    issues: [issue("COMPENSACAO_HORAS", "pendencia", mensagem)],
  });
  const inicio = i.apuracaoInicio,
    fim = i.apuracaoFim;
  if (!dataValida(inicio) || !dataValida(fim) || inicio > fim)
    return {
      situacao: "invalida",
      issues: [
        issue(
          "COMPENSACAO_HORAS",
          "erro",
          "Informe datas válidas e ordenadas para a apuração da compensação de horas.",
        ),
      ],
    };
  if (
    !instrumentoValido(state, inicio, "compensacaoHoras") ||
    !instrumentoValido(state, fim, "compensacaoHoras")
  )
    return {
      situacao: "invalida",
      issues: [
        issue(
          "COMPENSACAO_HORAS",
          "erro",
          "Compensação de horas exige ACT/CCT compatível e vigente em todo o período apurado.",
        ),
      ],
    };
  const periodo = dias.filter((d) => inicio <= d.data && d.data <= fim);
  const mapa = new Map(periodo.map((d) => [d.data, d]));
  let cursor = dateFromKey(inicio),
    quantidade = 0;
  while (
    isoDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()) <= fim
  ) {
    quantidade++;
    if (
      !mapa.has(
        isoDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      )
    )
      return incompleta(
        "O período de compensação inclui dias sem escala disponível. Gere/apure todos os dias antes de avaliar a média.",
      );
    cursor = addDays(cursor, 1);
  }
  if (periodo.some(ausenciaProgramada))
    return incompleta(
      "O período de compensação inclui férias ou afastamento. As ausências não constituem saldo compensatório; confira a cláusula no período efetivamente trabalhado.",
    );
  const refs = periodo.map((d) => referenciaDia(state, d.data, c));
  if (
    new Set(refs.map((r) => r.horas)).size !== 1 ||
    refs.some((r) => r.semLimiteJornada)
  )
    return incompleta(
      "Compensação de horas com mudança de fase ou enquadramento excepcional requer conferência específica; não é presumido rateio.",
    );
  const limite = refs[0].horas;
  const pico = Number(i.limiteSemanalCompensado);
  if (!Number.isFinite(pico) || pico < limite || pico > 168)
    return {
      situacao: "invalida",
      issues: [
        issue(
          "COMPENSACAO_HORAS",
          "erro",
          "Informe o teto semanal autorizado na cláusula de compensação, não inferior à referência ordinária.",
        ),
      ],
    };
  const computadas =
    [...mapa.values()]
      .filter((d) => ["T", "FE"].includes(d.status))
      .reduce(
        (s, d) =>
          s +
          Math.round(
            (d.horas +
              (d.creditoIntervaloCCT || 0) +
              (d.creditoNoturnoCCT || 0)) *
              60,
          ),
        0,
      ) / 60;
  const media = (computadas * 7) / quantidade;
  const suficiente = media <= limite + 0.001;
  return {
    situacao: suficiente ? "apurada" : "excedida",
    inicio,
    fim,
    pico,
    media,
    issues: [
      issue(
        "COMPENSACAO_HORAS",
        suficiente ? "pendencia" : "erro",
        `Compensação de horas: ${computadas.toFixed(2)}h computadas em ${quantidade} dias; média semanal ${media.toFixed(2)}h / referência ${limite}h. ${suficiente ? "Média atingida; a autorização e a quitação efetiva da compensação dependem da conferência da cláusula." : "Média acima do limite: o excedente não foi compensado no período informado."}`,
      ),
      ...(mesCalendario(inicio, fim)
        ? []
        : [
            issue(
              "COMPENSACAO_MES",
              "pendencia",
              `O período de apuração (${br(inicio)} a ${br(fim)}) não coincide com um mês-calendário. A Portaria MTE nº 2.041/2026, art. 3º, afere o limite médio semanal e mensal no mês-calendário; confira se a cláusula admite outro período (por exemplo, banco de horas) e apure também cada mês.`,
            ),
          ]),
    ],
  };
}

const br = (data) => data.split("-").reverse().join("/");
/** Período do dia 1º ao último dia do mesmo mês. */
export function mesCalendario(inicio, fim) {
  const [a, m, d] = inicio.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return d === 1 && fim === `${inicio.slice(0, 8)}${String(ultimo).padStart(2, "0")}`;
}
