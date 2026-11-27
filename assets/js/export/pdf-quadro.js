/* Relatório simples: só o quadro da escala, como na grade da tela. Uma tabela por
 * semana (segunda a domingo), colaboradores nas linhas e dias nas colunas. */
import { dateFromKey, formatDateBR, getMonday, addDays, isoDate } from "../domain/datas-horas.js";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const chave = (d) => isoDate(d.getFullYear(), d.getMonth(), d.getDate());
const curta = (iso) => formatDateBR(dateFromKey(iso)).slice(0, 5);

export function renderPdfQuadro({ doc, rel, pessoas, tabela, cor, folga, textoFolga }) {
  let y = 49;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...cor);
  doc.text("Quadro da escala", 13, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 52, 66);
  doc.text(rel.fixa
    ? "Padrão semanal recorrente: os mesmos horários e folgas em todas as semanas."
    : "Cada célula mostra o horário de trabalho e o intervalo (Int.), ou a situação do dia.", 13, y);
  y += 6;
  // Semanas (segunda a domingo) que contêm dias do período do relatório.
  const datas = [...new Set(pessoas.flatMap((p) => p.quadro.map((d) => d.data)))].sort();
  const semanas = [];
  if (rel.fixa) semanas.push(null);
  else if (datas.length)
    for (let s = getMonday(dateFromKey(datas[0])); chave(s) <= datas.at(-1); s = addDays(s, 7)) semanas.push(s);
  for (const semana of semanas) {
    const dias = semana ? DIAS.map((_, i) => chave(addDays(semana, i))) : null;
    const cabecalho = ["Colaborador", ...DIAS.map((d, i) => (dias ? `${d} ${curta(dias[i])}` : d))];
    const corpo = pessoas.map((p, n) => {
      const celulas = DIAS.map((_, i) => {
        const dia = dias ? p.quadro.find((d) => d.data === dias[i]) : p.quadro.find((d) => (d.weekday + 6) % 7 === i);
        return dia ? { content: dia.texto, folga: !dia.trabalho } : { content: "", fora: true };
      });
      return [{ content: `${n + 1}. ${p.nome}${p.cargo ? `\n${p.cargo}` : ""}` }, ...celulas];
    });
    if (y > 160) { doc.addPage(); y = 49; }
    if (semana) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...cor);
      doc.text(`Semana de ${curta(dias[0])} a ${formatDateBR(dateFromKey(dias[6]))}`, 13, y);
      y += 3;
    }
    tabela(cabecalho, corpo, y, {
      styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.6, overflow: "linebreak", valign: "middle", halign: "center", lineColor: [214, 223, 232], lineWidth: 0.15 },
      // 271 mm úteis: colaborador com 47 mm e sete dias com a mesma largura.
      columnStyles: { 0: { cellWidth: 47, halign: "left", fontStyle: "bold" }, ...Object.fromEntries(DIAS.map((_, i) => [i + 1, { cellWidth: 32 }])) },
      alternateRowStyles: {},
      didParseCell(d) {
        if (d.section !== "body" || d.column.index === 0) return;
        const raw = d.row.raw[d.column.index];
        if (raw?.folga) { d.cell.styles.fillColor = folga; d.cell.styles.textColor = textoFolga; }
        if (raw?.fora) d.cell.styles.fillColor = [244, 246, 249];
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
}
