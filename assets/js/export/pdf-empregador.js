import { analisarCobertura } from "../domain/cobertura.js";
import {
  agruparHorarios,
  agruparConferencias,
  referenciasConferencia,
  agruparLacunas,
} from "./resumo-empregador.js";
const navy = [15, 40, 68];
const corSituacao = (s) =>
  s === "Horas OK"
    ? [17, 117, 76]
    : s === "Acima"
      ? [180, 40, 40]
      : s === "Parcial"
        ? [85, 100, 115]
        : [154, 95, 15];
const niveis = {
  erro: "Corrigir",
  alerta: "Analisar",
  pendencia: "Conferir",
  info: "Informação",
};
export function renderPdfEmpregador({ doc, rel, pessoas, tabela }) {
  let y = 49;
  const nova = () => {
    doc.addPage();
    y = 49;
  };
  const espaco = (h) => {
    if (y + h > 190) nova();
  };
  function texto(s, size = 9, { titulo = false, cor = navy } = {}) {
    doc.setFont("helvetica", titulo ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...cor);
    const lines = doc.splitTextToSize(String(s), 270),
      altura = size * 0.4;
    while (lines.length) {
      espaco(altura + 4);
      const n = Math.max(1, Math.floor((190 - y - 4) / altura));
      const parte = lines.splice(0, n);
      doc.text(parte, 13, y);
      y += parte.length * altura + 4;
      if (lines.length) nova();
    }
  }
  function secao(titulo, minimo = 28) {
    espaco(minimo);
    texto(titulo, 12, { titulo: true });
  }
  function quadro(head, body, extra = {}) {
    if (!body.length) return;
    tabela(head, body, y, {
      tableWidth: 270,
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 1.5,
        overflow: "linebreak",
      },
      ...extra,
    });
    y = doc.lastAutoTable.finalY + 7;
  }
  const horarios = agruparHorarios(rel, pessoas),
    conferencias = agruparConferencias(pessoas, rel.fixa);
  const erros = pessoas.reduce(
    (n, p) => n + p.ocorrencias.filter((i) => i.severidade === "erro").length,
    0,
  );
  texto("Escala da equipe • visão resumida", 15, { titulo: true });
  texto(
    `${pessoas.length} colaborador(es) | ${conferencias.length} ponto(s) de atenção agrupado(s).`,
  );
  if (erros)
    texto(
      `RASCUNHO COM INCOMPATIBILIDADES: ${erros} ocorrência(s) de erro. Corrija os pontos de atenção antes de utilizar a escala.`,
      9,
      { cor: [180, 40, 40] },
    );
  else
    texto(
      "Rascunho para conferência. Revise os pontos de atenção e as condições de cobertura.",
    );
  texto(
    rel.fixa
      ? "Dias da semana agrupados por horários iguais. O padrão não considera feriados."
      : "Os números na coluna Dias indicam os dias do mês do cabeçalho. Datas com horários e situações iguais ficam reunidas.",
  );
  quadro(
    [
      "Colaborador",
      "Dias",
      "Situação",
      "Entrada",
      "Intervalo",
      "Saída",
      "Trabalho",
      "Função",
    ],
    horarios.map((g) => [`${g.indice + 1}. ${g.nome}`, g.dias, ...g.detalhes]),
    {
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 48 },
        2: { cellWidth: 33 },
        3: { cellWidth: 20 },
        4: { cellWidth: 33 },
        5: { cellWidth: 20 },
        6: { cellWidth: 21 },
        7: { cellWidth: 49 },
      },
      didParseCell(d) {
        if (d.section === "body" && String(d.row.raw[2]).startsWith("Folga")) {
          d.cell.styles.fillColor = [234, 242, 249];
          d.cell.styles.textColor = navy;
        }
      },
    },
  );
  const semanas = [
    ...new Set(pessoas.flatMap((p) => p.semanas.map((s) => s[0]))),
  ].sort((a, b) =>
    a
      .split("/")
      .reverse()
      .join("-")
      .localeCompare(b.split("/").reverse().join("-")),
  );
  if (semanas.length) {
    secao("Carga semanal • computadas / alvo", 40);
    texto(
      "T = trabalhadas; A = abono de feriado; CCT = créditos declarados. Semanas civis podem incluir dias do mês vizinho; Parcial indica apuração incompleta.",
      8.5,
    );
    quadro(
      ["Colaborador", ...semanas.map((s) => (rel.fixa ? s : `Semana de ${s}`))],
      pessoas.map((p, i) => [
        `${i + 1}. ${p.nome}`,
        ...semanas.map((k) => {
          const s = p.semanas.find((s) => s[0] === k);
          if (!s) return "—";
          const creditos = [];
          if (s[2] !== "00:00") creditos.push(`A ${s[2]}`);
          if (s[3] !== "00:00") creditos.push(`CCT ${s[3]}`);
          return `${creditos.length ? `T ${s[1]} + ${creditos.join(" + ")}\n` : ""}${s[4]} / ${s[5]}\n${s[6]}`;
        }),
      ]),
      {
        columnStyles: { 0: { cellWidth: 46 } },
        didParseCell(d) {
          if (d.section === "body" && d.column.index > 0) {
            const s = String(d.cell.raw).split("\n").at(-1);
            d.cell.styles.textColor = corSituacao(s);
          }
        },
      },
    );
  }
  const cobertura = analisarCobertura(
    rel.config,
    rel.config.escalaGerada.resultado,
  );
  const lacunas = agruparLacunas(cobertura.lacunas, rel);
  secao("Cobertura operacional");
  texto(
    !cobertura.configurada
      ? "Cobertura não avaliada: demanda operacional não cadastrada."
      : lacunas.length
        ? "Há horários descobertos nas faixas abaixo. Lacunas isoladas não comprovam necessidade de contratação."
        : cobertura.avisos.length
          ? "Cobertura com avisos: a ausência de lacunas não confirma o atendimento da operação. Confira as condições abaixo."
          : "Sem lacunas nas faixas cadastradas. Confira também as condições e pendências da escala.",
  );
  for (const aviso of new Set(cobertura.avisos || [])) texto(aviso, 8.5);
  quadro(
    ["Função", "Dias", "Horário descoberto", "Pessoas faltantes"],
    lacunas.map((l) => [l.funcao, l.dias, l.horario, l.faltantes]),
    {
      columnStyles: {
        0: { cellWidth: 85 },
        1: { cellWidth: 80 },
        2: { cellWidth: 65 },
        3: { cellWidth: 40 },
      },
    },
  );
  if (conferencias.length) {
    secao("Pontos de atenção • ocorrências reunidas", 40);
    texto(
      "Cada condição aparece uma vez, com os colaboradores e suas referências. Valores ou condições diferentes continuam separados.",
      8.5,
    );
    quadro(
      ["Nível", "Conferência necessária", "Colaboradores / referências"],
      conferencias.map((g) => [
        `${niveis[g.severidade] || g.severidade}\n${g.ocorrencias} ocorrência(s)`,
        g.mensagem + (g.acao ? `\nAção: ${g.acao}` : ""),
        referenciasConferencia(g, pessoas.length),
      ]),
      {
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 148 },
          2: { cellWidth: 98 },
        },
        didParseCell(d) {
          if (
            d.section === "body" &&
            conferencias[d.row.index]?.severidade === "erro"
          ) {
            d.cell.styles.textColor = [180, 40, 40];
          }
        },
      },
    );
  }
}
