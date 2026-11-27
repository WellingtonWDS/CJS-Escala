import { VERSAO_REGRAS, referenciaDia } from "../domain/ec141.js";
import { renderPdfEmpregador } from "./pdf-empregador.js";
import { renderPdfQuadro } from "./pdf-quadro.js";
import { temaPdf, caixaLogo } from "./marca-pdf.js";
export async function criarPdf(
  rel,
  pessoas,
  { logo, marca = null, empregador = false, quadro = false, libs, emitido = new Date() },
) {
  const { jsPDF, autoTable } = libs;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  // Cores da marca do escritório (com contraste conferido) ou identidade padrão.
  const tema = temaPdf(marca),
    navy = tema.titulo,
    azul = tema.folga;
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
      headStyles: { fillColor: tema.cabecalhoTabela.fill, textColor: tema.cabecalhoTabela.text },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      rowPageBreak: "avoid",
      ...extra,
    });
  // Títulos na cor da marca; texto corrido em tom neutro.
  const neutro = [40, 52, 66];
  const texto = (s, y, size = 10, cor = size >= 12 ? navy : neutro) => {
    doc.setTextColor(...cor);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(s), 270);
    doc.text(lines, 13, y);
    return y + lines.length * size * 0.4 + 4;
  };
  const nova = () => doc.addPage();
  const titulares = new Map();
  if (empregador) renderPdfEmpregador({ doc, rel, pessoas, tabela, cor: navy, folga: azul });
  else if (quadro) renderPdfQuadro({ doc, rel, pessoas, tabela, cor: navy, folga: azul, textoFolga: tema.textoFolga });
  else
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
              data.cell.styles.textColor = tema.textoFolga;
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
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    doc.setFillColor(...tema.primaria);
    doc.rect(0, 0, 297, 4, "F");
    // Marca do escritório em destaque no canto superior direito.
    const temLogo = !!marca?.logo;
    if (temLogo) {
      const { w, h } = caixaLogo(marca.logoWidth, marca.logoHeight);
      doc.addImage(marca.logo, "PNG", 284 - w, 7 + (22 - h) / 2, w, h, "marca-escritorio", "FAST");
    } else if (marca?.displayName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...navy);
      doc.text(doc.splitTextToSize(marca.displayName, 70).slice(0, 2), 284, 15, { align: "right" });
    } else if (logo) doc.addImage(logo, "PNG", 241, 9, 42, 14, undefined, "FAST");
    doc.setFont("helvetica", "bold");
    texto(
      `${rel.tipo} • ${empregador ? "Equipe completa" : quadro ? "Quadro da escala" : "Escala individual"}`,
      14,
      14,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...neutro);
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
    // Rodapé: indicação discreta de que o relatório foi elaborado no Reescala.
    const comMarca = (temLogo || marca?.displayName) && logo;
    if (comMarca) doc.addImage(logo, "PNG", 13, 195.6, 12, 4, "reescala-rodape", "FAST");
    doc.text(
      `${marca?.displayName ? `${marca.displayName} • ` : ""}Elaborado no Reescala • Rascunho • ${VERSAO_REGRAS} • Emitido em ${emitido.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      comMarca ? 26 : 13,
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
