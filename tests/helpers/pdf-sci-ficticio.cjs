// Gera, em memória, um relatório "Horário de Trabalho" no layout da SCI com
// dados fictícios (nomes, documentos e empresa inexistentes).
const PESSOAS = [
  { codigo: "11", nome: "ANA FICTICIA SOUZA", cargo: "VENDEDOR (A)", ctps: "1234567", serie: "00011", dias: "Seg, Ter, Qua, Qui, Sex", jornada: ["08:00", "11:00", "13:00", "18:00"], sabado: ["08:00", "", "", "12:00"] },
  { codigo: "12", nome: "BRUNO EXEMPLO LIMA", cargo: "MONTADOR APARELHOS ELETROELETRONICOS", ctps: "7654321", serie: "00022", cargoSeparado: true, dias: "Seg, Ter, Qua, Qui, Sex", jornada: ["07:30", "14:00", "16:00", "17:30"], sabado: ["07:30", "", "", "11:30"] },
  { codigo: "13", nome: "CARLA TESTE ROCHA", cargo: "CAIXA", ctps: "0011223", serie: "1641", dias: "Seg, Ter, Qua, Qui, Sex, Sáb", jornada: ["09:00", "12:00", "13:00", "15:20"] },
];
module.exports = async function pdfSciFicticio({ paginas = 1, pessoas = PESSOAS } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica");
  const altura = 842, y = (v) => altura - v;
  const porPagina = Math.ceil(pessoas.length / paginas);
  for (let p = 0; p < paginas; p++) {
    if (p) doc.addPage();
    doc.setFontSize(8); doc.text(`Pag: ${p + 1}`, 556, y(821));
    doc.setFontSize(16); doc.text("ESCRITORIO FICTICIO CONTABIL", 171, y(814.7));
    doc.setFontSize(14); doc.text("COMERCIO FICTICIO EXEMPLO LTDA", 161, y(789.5));
    doc.setFontSize(8); doc.text("H O R Á R I O   D E   T R A B A L H O", 224, y(769.2));
    doc.text("Empregador : COMERCIO FICTICIO EXEMPLO LTDA", 3, y(743.4));
    doc.text("Endereço : RUA DAS AMOSTRAS 100 - CIDADE TESTE / MG", 3, y(730.3));
    doc.text("Atividade : 4781400 - Comércio varejista de artigos do vestuário e acessórios", 3, y(717.3));
    const colunas = [["Código", 5], ["Funcionário", 39], ["Cargo", 129], ["Cart.Trab.", 252], ["Série", 300], ["Dia", 328], ["Entrada", 355], ["Intervalo", 406], ["Saída", 456], ["Des.Sem", 486], ["Visto do fiscal", 526]];
    for (const [t, x] of colunas) doc.text(t, x, y(691.5));
    let v = 678;
    for (const c of pessoas.slice(p * porPagina, (p + 1) * porPagina)) {
      doc.text(c.codigo, 20, y(v)); doc.text(c.nome, 39, y(v)); v -= 10;
      doc.text(c.cargo, 129, y(v));
      if (c.cargoSeparado) v -= 10;
      doc.text(c.ctps, 260, y(v)); doc.text(c.serie, 300, y(v)); v -= 10;
      const [e, ii, fi, s] = c.jornada;
      doc.text(c.dias, 280, y(v)); doc.text(e, 380, y(v)); doc.text(`${ii} as ${fi}`, 420, y(v)); doc.text(s, 470, y(v));
      doc.text("Domingo", 496, y(v)); doc.text("_______________", 526, y(v)); v -= 10;
      if (c.sabado) { doc.text("*** SÁBADO :", 330, y(v)); doc.text(c.sabado[0], 380, y(v)); doc.text("as", 438, y(v)); doc.text(c.sabado[3], 470, y(v)); v -= 10; }
    }
    doc.text("Mod. Aprovado pela Portaria nº. 3088 de 28/04/1980", 3, y(v - 10));
    doc.text("Observações :", 3, y(v - 20));
    doc.text("CIDADE TESTE, 01 de Novembro de 2026", 3, y(v - 50));
    doc.text("folha SCI VISUAL Practice", 450, y(v - 80));
  }
  return doc.output("arraybuffer");
};
module.exports.PESSOAS = PESSOAS;
