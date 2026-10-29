import { VERSAO_REGRAS, referenciaDia } from "../domain/ec141.js";
import { analisarCobertura } from "../domain/cobertura.js";
import {
  horarioComDia,
  dateFromKey,
  formatDateBR,
} from "../domain/datas-horas.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
export async function criarPdf(
  rel,
  pessoas,
  { logo, empregador = false, libs, emitido = new Date() },
) {
  const { jsPDF, autoTable } = libs;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const navy = [15, 40, 68],
    azul = [234, 242, 249];
  const tabela = (head, body, y, extra = {}) =>
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      margin: { top: 45, bottom: 17, left: 13, right: 13 },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2.1,
        overflow: "linebreak",
      },
      headStyles: { fillColor: navy },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      rowPageBreak: "avoid",
      ...extra,
    });
  const texto = (s, y, size = 10) => {
    doc.setTextColor(...navy);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(s), 270);
    doc.text(lines, 13, y);
    return y + lines.length * size * 0.4 + 4;
  };
  const nova = () => doc.addPage();
  const titulares = new Map();
  if (empregador) {
    const y = texto("Resumo da equipe", 49, 16);
    tabela(
      [
        "Colaborador",
        "Função",
        "Horas computadas / alvo por semana",
        "Conferências",
      ],
      pessoas.map((p) => [
        p.nome,
        p.cargo,
        p.semanas.map((s) => `${s[0]}: ${s[4]} / ${s[5]} (${s[6]})`).join("\n"),
        `${p.ocorrencias.filter((i) => i.severidade === "erro").length} erro(s) • ${p.ocorrencias.length} ocorrência(s)`,
      ]),
      y,
      {
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 45 },
          2: { cellWidth: 110 },
        },
      },
    );
  }
  for (let pi = 0; pi < pessoas.length; pi++) {
    if (pi || empregador) nova();
    const p = pessoas[pi];
    const primeiraPagina = doc.getNumberOfPages();
    let y = texto(p.nome, 49, 16);
    y = texto(`Função: ${p.cargo || "Não informada"}`, y);
    const erros = p.ocorrencias.filter((i) => i.severidade === "erro").length;
    y = texto(
      erros
        ? `RASCUNHO COM INCOMPATIBILIDADES: ${erros} ocorrência(s). Confira as pendências ao final.`
        : "RASCUNHO PARA CONFERÊNCIA • Consulte as pendências ao final.",
      y,
      9,
    );
    tabela(
      [
        "Dia",
        "Situação",
        "Entrada",
        "Intervalo",
        "Saída",
        "Trabalho",
        "Função no dia",
      ],
      p.linhas,
      y,
      {
        columnStyles: {
          0: { cellWidth: 43 },
          1: { cellWidth: 42 },
          2: { cellWidth: 24 },
          3: { cellWidth: 41 },
          4: { cellWidth: 24 },
          5: { cellWidth: 23 },
        },
        didParseCell(data) {
          if (data.section === "body" && data.row.raw[1] === "Folga") {
            data.cell.styles.fillColor = azul;
            data.cell.styles.textColor = navy;
          }
        },
      },
    );
    y = doc.lastAutoTable.finalY + 8;
    if (y > 158) {
      nova();
      y = 49;
    }
    y = texto("Resumo semanal", y, 12);
    tabela(
      [
        "Semana iniciada em",
        "Trabalhadas",
        "Abonadas",
        "Créditos CCT",
        "Computadas",
        "Alvo",
        "Situação",
      ],
      p.semanas,
      y,
      {
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 6) {
            const s = data.cell.raw;
            data.cell.styles.textColor =
              s === "Horas OK"
                ? [17, 117, 76]
                : s === "Acima"
                  ? [180, 40, 40]
                  : [154, 95, 15];
          }
        },
      },
    );
    if (p.ocorrencias.length) {
      nova();
      y = texto(`Conferências • ${p.nome}`, 49, 13);
      tabela(
        ["Nível", "Conferência necessária"],
        p.ocorrencias.map((i) => [i.severidade, i.mensagem]),
        y,
      );
    }
    for (let n = primeiraPagina; n <= doc.getNumberOfPages(); n++)
      titulares.set(n, p.nome);
  }
  if (empregador) {
    nova();
    let y = texto("Visão da operação • cobertura", 49, 16);
    const cobertura = analisarCobertura(
      rel.config,
      rel.config.escalaGerada.resultado,
    );
    y = texto(
      !rel.config.coberturaAtiva
        ? "Cobertura não avaliada: demanda operacional não cadastrada."
        : cobertura.lacunas.length
          ? "Há horários descobertos. As lacunas não demonstram, isoladamente, necessidade de contratação."
          : "Não foram identificadas lacunas nas faixas cadastradas. Confira os avisos e as pendências individuais.",
      y,
    );
    if (cobertura.avisos?.length) y = texto(cobertura.avisos.join(" "), y, 9);
    if (cobertura.lacunas.length)
      tabela(
        ["Dia", "Função", "De", "Até", "Necessários", "Presentes", "Faltantes"],
        cobertura.lacunas.map((l) => [
          rel.fixa
            ? DIAS_SEMANA[dateFromKey(l.data).getDay()]
            : formatDateBR(dateFromKey(l.data)),
          l.funcao,
          horarioComDia(l.inicioMin),
          horarioComDia(l.fimMin),
          l.necessarios,
          l.presentes,
          l.faltantes,
        ]),
        y,
      );
  }
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    doc.setFillColor(...navy);
    doc.rect(0, 0, 297, 4, "F");
    if (logo) doc.addImage(logo, "PNG", 241, 9, 42, 14, undefined, "FAST");
    doc.setFont("helvetica", "bold");
    texto(
      `${rel.tipo} • ${empregador ? "Equipe completa" : "Escala individual"}`,
      14,
      14,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(rel.empresa, 218).slice(0, 2), 13, 22);
    texto(
      `${rel.periodo} | ${rel.config.modoRegime === "simulacao" ? "SIMULAÇÃO" : "Vigência automática"} | ${referenciaDia(rel.config, rel.fixa ? rel.config.dataReferenciaFixa : `${rel.config.ano}-${String(rel.config.mes + 1).padStart(2, "0")}-01`).nome}`,
      33,
      9,
    );
    doc.setDrawColor(210, 220, 230);
    if (titulares.has(n)) {
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(titulares.get(n), 270)[0], 13, 38);
    }
    doc.line(13, 40, 284, 40);
    doc.setFontSize(7);
    doc.setTextColor(85, 100, 115);
    doc.text(
      `Reescala • Rascunho • ${VERSAO_REGRAS} • Emitido em ${emitido.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      13,
      199,
    );
    doc.text(`${n} / ${total}`, 284, 199, { align: "right" });
    doc.text(
      rel.fixa
        ? "Padrão recorrente sem feriados. Reavaliar vigência jurídica e ACT/CCT antes da aplicação."
        : "(+1d) indica horário no dia seguinte. Abonos e créditos não representam presença na cobertura.",
      13,
      204,
    );
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
