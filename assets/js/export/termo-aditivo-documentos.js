/* PDF (jsPDF) e Word (.docx gerado diretamente, sem dependência nova) do termo
 * aditivo. Ambos são documentos para assinatura: sem logotipo do sistema e sem
 * avisos no corpo; o aviso de conferência acompanha o ZIP em LEIA-ME.txt. */

/** PDF A4 retrato. */
export function criarPdfTermo(termo, titulo, { jsPDF, autoTable }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margem = 20, largura = 170;
  let y = 22;
  const quebra = (altura) => { if (y + altura > 280) { doc.addPage(); y = 22; } };
  const paragrafo = (texto, { tamanho = 10.5, negrito = false, centro = false, espaco = 3 } = {}) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(texto, largura);
    const altura = linhas.length * tamanho * 0.42;
    quebra(altura);
    // Todo o texto justificado; só o título fica centralizado.
    doc.text(linhas, centro ? 105 : margem, y, { align: centro ? "center" : "justify", maxWidth: largura });
    y += altura + espaco;
  };
  paragrafo(titulo, { tamanho: 13, negrito: true, centro: true, espaco: 7 });
  paragrafo(termo.partes, { espaco: 5 });
  for (const c of termo.clausulas) {
    // Título da cláusula não fica sozinho no fim da página: vai junto com o início do texto.
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    const inicio = Math.min(3, doc.splitTextToSize(c.texto.split("\n")[0], largura).length);
    quebra(10.5 * 0.42 * (inicio + 1) + 1.5);
    paragrafo(`CLÁUSULA ${c.numero}ª – ${c.titulo.toUpperCase()}`, { negrito: true, espaco: 1.5 });
    c.texto.split("\n").forEach((t, i, todos) => paragrafo(t, { espaco: i < todos.length - 1 ? 1.8 : 3 }));
    if (c.id === "horario") {
      quebra(12 + termo.horario.length * 8);
      autoTable(doc, {
        startY: y, margin: { left: margem, right: margem },
        head: [["Dias", "Entrada", "Intervalo", "Saída", "Horas"]],
        body: termo.horario.map((h) => [h.rotulo, h.entrada, h.intervalo, h.saida, h.horas]),
        styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 40, 68] },
      });
      y = doc.lastAutoTable.finalY + 5;
    }
  }
  // Data e assinaturas sempre na mesma página.
  y += 4;
  quebra(78);
  paragrafo(termo.local, { espaco: 22 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  [[termo.empresa.nome, `CNPJ: ${termo.empresa.cnpj}`, "EMPREGADOR"], [termo.nome, `CPF: ${termo.cpf}`, "EMPREGADO(A)"]].forEach(([nome, identificacao, papel], i) => {
    const x = margem + i * 90;
    doc.line(x, y, x + 78, y);
    doc.text([...doc.splitTextToSize(nome, 78), identificacao, papel], x, y + 5);
  });
  y += 30;
  doc.text("Testemunhas:", margem, y); y += 16;
  for (const x of [margem, margem + 90]) {
    doc.line(x, y, x + 78, y);
    doc.text(["Nome:", "CPF:"], x, y + 5);
  }
  return doc.output("arraybuffer");
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const run = (texto, { negrito = false, tamanho = 22 } = {}) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${negrito ? "<w:b/>" : ""}<w:sz w:val="${tamanho}"/></w:rPr><w:t xml:space="preserve">${xml(texto)}</w:t></w:r>`;
const par = (texto, { negrito = false, centro = false, tamanho = 22, depois = 120 } = {}) =>
  `<w:p><w:pPr><w:spacing w:after="${depois}"/><w:jc w:val="${centro ? "center" : "both"}"/></w:pPr>${run(texto, { negrito, tamanho })}</w:p>`;
function tabela(linhas) {
  const borda = '<w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/>';
  const celula = (t, cabecalho) => `<w:tc><w:tcPr>${cabecalho ? '<w:shd w:val="clear" w:color="auto" w:fill="0F2844"/>' : ""}</w:tcPr><w:p>${cabecalho
    ? `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`
    : run(t, { tamanho: 19 })}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borda}</w:tblBorders></w:tblPr>${linhas
    .map((l, i) => `<w:tr>${l.map((t) => celula(t, i === 0)).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
}

/** Word (.docx) editável: o escritório completa salário e fundamento. */
export function criarDocxTermo(termo, titulo, { zipSync }) {
  const corpo = [par(titulo, { negrito: true, centro: true, tamanho: 26, depois: 240 }), par(termo.partes, { depois: 200 })];
  for (const c of termo.clausulas) {
    corpo.push(par(`CLÁUSULA ${c.numero}ª – ${c.titulo.toUpperCase()}`, { negrito: true, depois: 60 }), ...c.texto.split("\n").map((t) => par(t)));
    if (c.id === "horario")
      corpo.push(tabela([["Dias", "Entrada", "Intervalo", "Saída", "Horas"], ...termo.horario.map((h) => [h.rotulo, h.entrada, h.intervalo, h.saida, h.horas])]));
  }
  corpo.push(par(termo.local, { depois: 600 }));
  for (const [nome, identificacao, papel] of [[termo.empresa.nome, `CNPJ: ${termo.empresa.cnpj}`, "EMPREGADOR"], [termo.nome, `CPF: ${termo.cpf}`, "EMPREGADO(A)"]])
    corpo.push(par("______________________________________", { depois: 0 }), par(nome, { depois: 0 }), par(identificacao, { depois: 0 }), par(papel, { depois: 480 }));
  corpo.push(par("Testemunhas:", { depois: 480 }));
  for (const n of [1, 2]) corpo.push(par("______________________________________", { depois: 0 }), par(`Testemunha ${n} – Nome:`, { depois: 0 }), par("CPF:", { depois: 360 }));
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const e = (s) => new TextEncoder().encode(s);
  return zipSync({
    "[Content_Types].xml": e('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": e('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": e(documento),
  });
}
