/* Diagnóstico da empresa em PDF (retrato A4), com a logomarca e as cores do escritório.
 * Sem marca cadastrada, usa a identidade padrão do Reescala. O conteúdo é o mesmo da
 * conferência: todas as perguntas visíveis, a resposta, a situação e as observações. */
import {
  ETAPAS_DIAGNOSTICO,
  CERTEZAS,
  visivel,
  resumoDiagnostico,
} from "../diagnostico/questionario.js";
import { textoResposta } from "../ui/diagnostico-perguntas.js";
import { temaPdf, caixaLogo } from "./marca-pdf.js";
import { formatCnpj } from "../shared/empresas.js";

const L = 210, A = 297, M = 15, TOPO = 42, BASE = 280;
const NEUTRO = [40, 52, 66], SUAVE = [85, 100, 115];
const COR_SITUACAO = {
  confirmada: [17, 117, 76],
  estimativa: [42, 95, 176],
  pendente: [154, 95, 15],
  nao: [110, 120, 130],
};
const dataBr = (v) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

export function criarPdfDiagnostico({
  libs,
  payload,
  empresa = {},
  registro = null,
  marca = null,
  logo = null,
  alteracoesNaoSalvas = false,
  emitido = new Date(),
}) {
  const { jsPDF, autoTable } = libs;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const tema = temaPdf(marca);
  const answers = payload?.answers || {};
  let y = TOPO;

  const texto = (s, { tam = 10, cor = NEUTRO, negrito = false, x = M, largura = L - 2 * M, apos = 2 } = {}) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(String(s), largura), altura = tam * 0.42;
    for (const linha of linhas) {
      if (y + altura > BASE) { doc.addPage(); y = TOPO; }
      doc.text(linha, x, y);
      y += altura;
    }
    y += apos;
  };
  const espaco = (h) => { if (y + h > BASE) { doc.addPage(); y = TOPO; } };

  // Resumo em três quadros.
  const r = resumoDiagnostico(payload || { answers: {} });
  const quadros = [
    ["Perguntas respondidas", `${r.respondidas} de ${r.total}`],
    ["Pendências para conferir", String(r.pendencias.length)],
    ["Respostas estimadas", String(r.estimativas.length)],
  ];
  const lq = (L - 2 * M - 8) / 3;
  quadros.forEach(([rotulo, valor], i) => {
    const x = M + i * (lq + 4);
    doc.setFillColor(...tema.folga);
    doc.roundedRect(x, y, lq, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...tema.titulo);
    doc.text(valor, x + 4, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...NEUTRO);
    doc.text(rotulo, x + 4, y + 15.5);
  });
  y += 27;
  texto("Este registro reúne as premissas informadas para elaborar a escala. Não certifica a conformidade da operação nem substitui a conferência do ACT/CCT.", { tam: 8.5, cor: SUAVE, apos: 5 });

  if (r.pendencias.length) {
    espaco(16);
    texto("Pendências para conferir", { tam: 12, cor: tema.titulo, negrito: true, apos: 1.5 });
    for (const q of r.pendencias) texto(`•  ${q.titulo}`, { tam: 9.5, x: M + 2, largura: L - 2 * M - 4, apos: 0.8 });
    y += 4;
  }

  const tabela = (body) => {
    autoTable(doc, {
      head: [["Pergunta", "Resposta", "Situação"]],
      body,
      startY: y,
      margin: { top: TOPO, bottom: A - BASE + 2, left: M, right: M },
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 2, overflow: "linebreak", textColor: NEUTRO, valign: "top" },
      headStyles: { fillColor: tema.cabecalhoTabela.fill, textColor: tema.cabecalhoTabela.text, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles: { 0: { cellWidth: 62, fontStyle: "bold" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 28 } },
      rowPageBreak: "avoid",
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 2) d.cell.styles.textColor = COR_SITUACAO[d.row.raw.situacao] || NEUTRO;
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  ETAPAS_DIAGNOSTICO.forEach((etapa, i) => {
    const linhas = etapa.perguntas
      .filter((q) => visivel(q, answers))
      .map((q) => {
        const a = answers[q.id];
        const linha = [
          q.titulo + (q.obrigatoria ? " *" : ""),
          textoResposta(q, a) + (a?.note ? `\nObservação: ${a.note}` : ""),
          a ? CERTEZAS[a.certainty] : "Não respondida",
        ];
        linha.situacao = a ? a.certainty : "nao";
        return linha;
      });
    espaco(24);
    texto(`${i + 1}. ${etapa.titulo}`, { tam: 12, cor: tema.titulo, negrito: true, apos: 1.5 });
    tabela(linhas);
  });
  texto("* Informação essencial para elaborar a proposta.", { tam: 8, cor: SUAVE });

  // Cabeçalho e rodapé em todas as páginas.
  const total = doc.getNumberOfPages();
  const temLogo = !!marca?.logo;
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    doc.setFillColor(...tema.primaria);
    doc.rect(0, 0, L, 4, "F");
    if (temLogo) {
      const { w, h } = caixaLogo(marca.logoWidth, marca.logoHeight, 55, 18);
      doc.addImage(marca.logo, "PNG", L - M - w, 8 + (18 - h) / 2, w, h, "marca-escritorio", "FAST");
    } else if (marca?.displayName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...tema.titulo);
      doc.text(doc.splitTextToSize(marca.displayName, 60).slice(0, 2), L - M, 15, { align: "right" });
    } else if (logo) doc.addImage(logo, "PNG", L - M - 42, 9, 42, 14, "reescala-topo", "FAST");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...tema.titulo);
    doc.text("Diagnóstico da empresa", M, 16);
    doc.setFontSize(10.5);
    doc.setTextColor(...NEUTRO);
    doc.text(doc.splitTextToSize(`${empresa.nome || "Empresa"}${empresa.cnpj ? ` · CNPJ ${formatCnpj(empresa.cnpj)}` : ""}`, 125)[0], M, 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SUAVE);
    const situacao = registro
      ? `${registro.status === "concluido" ? "Concluído" : "Rascunho"} · revisão ${registro.revision}${registro.updatedBy ? ` · ${registro.updatedBy}` : ""}${registro.updatedAt ? ` · ${dataBr(registro.updatedAt)}` : ""}`
      : "Ainda não salvo";
    doc.text(`${situacao}${alteracoesNaoSalvas ? " · inclui alterações ainda não salvas" : ""}`, M, 29);
    doc.setDrawColor(210, 220, 230);
    doc.line(M, 34, L - M, 34);
    // Rodapé: escritório em destaque e indicação discreta do Reescala.
    doc.setFontSize(7);
    doc.setTextColor(...SUAVE);
    const comMarca = (temLogo || marca?.displayName) && logo;
    if (comMarca) doc.addImage(logo, "PNG", M, A - 10.4, 12, 4, "reescala-rodape", "FAST");
    doc.text(
      `${marca?.displayName ? `${marca.displayName} • ` : ""}Elaborado no Reescala • Emitido em ${emitido.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      comMarca ? M + 13 : M,
      A - 7.5,
    );
    doc.text(`${n} / ${total}`, L - M, A - 7.5, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
