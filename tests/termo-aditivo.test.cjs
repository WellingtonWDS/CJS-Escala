const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let converter, base, montar, listaDias, criarPdfTermo, criarDocxTermo, libs;
before(async () => {
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
  ({ montarTermosAditivos: montar, listaDias } = await import("../assets/js/export/termo-aditivo.js"));
  ({ criarPdfTermo, criarDocxTermo } = await import("../assets/js/export/termo-aditivo-documentos.js"));
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const { zipSync, unzipSync } = await import("fflate");
  libs = { jsPDF, autoTable, zipSync, unzipSync };
});
const J = { entrada: "08:00", intInicio: "12:00", intFim: "14:00", saida: "18:00" };
function estado(extra = {}) {
  const s = base(new Date(2026, 10, 18));
  s.colaboradores = [
    { id: 1, nome: "Ana Ficticia", sexo: "feminino", cargo: "Vendedora", horasSemana: 44,
      // Perfil Domínio inativo: só fornece CTPS e série, sem horário individual.
      quadroDominio: { ativo: false, tipo: "semanal", semana: {}, codigo: "1", ctps: "1234567", serie: "00011", pendencias: [] } },
    { id: 2, nome: "Beto Exemplo", sexo: "masculino", cargo: "Caixa", horasSemana: 36 },
  ];
  Object.assign(s, { horarioPorDia: true, jornada: J,
    jornadaPorDia: { 1: J, 2: J, 3: J, 4: J, 5: J, 6: { entrada: "08:00", intInicio: "", intFim: "", saida: "12:00" } },
    diasTrabalho: [1, 2, 3, 4, 5, 6],
    empresaDominio: { nome: "COMERCIO FICTICIO LTDA", cnpj: "11.222.333/0001-81", endereco: "RUA DAS AMOSTRAS 100 - CIDADE TESTE / MG" } }, extra);
  s.conversao = converter(s, { periodo: "2027-03", fase: "automatico", folgas: "distribuir" });
  return s;
}
const clausula = (t, titulo) => t.clausulas.find((c) => c.titulo === titulo);

test("termo do contrato de 44h: redução para 42h, horário 8h24, folgas, salário e fundamento em branco", () => {
  const { termos, titulo } = montar(estado());
  assert.equal(titulo, "TERMO ADITIVO AO CONTRATO INDIVIDUAL DE TRABALHO");
  const ana = termos[0];
  assert.match(ana.partes, /COMERCIO FICTICIO LTDA, inscrita no CNPJ sob o nº 11\.222\.333\/0001-81/);
  assert.match(ana.partes, /CTPS nº 1234567, série 00011, ocupante do cargo de Vendedora/);
  assert.match(clausula(ana, "Duração do trabalho").texto, /passa de 44 horas para 42 horas semanais/);
  assert.deepEqual(ana.horario.map((h) => [h.rotulo, h.entrada, h.intervalo, h.saida, h.horas]),
    [["Segunda a sexta-feira", "08:00", "12:00 às 13:36", "18:00", "8h24"]]);
  assert.match(clausula(ana, "Repouso semanal remunerado").texto, /fixados em: sábado e domingo/);
  assert.match(clausula(ana, "Remuneração").texto, /R\$ _{6,}/);
  assert.match(clausula(ana, "Remuneração").texto, /art\. 2º/);
  assert.match(clausula(ana, "Distribuição diária da jornada").texto, /até 8h24 diárias observa o seguinte fundamento: _{10,}/);
  assert.ok(clausula(ana, "Segunda etapa da redução"));
  // Decreto 13.173/2026, art. 5º: divisor 210 na fase de 42h e 200 a partir de 16/12/2027.
  assert.match(clausula(ana, "Salário-hora").texto, /divisor 210 \(duzentos e dez\)/);
  assert.match(clausula(ana, "Salário-hora").texto, /A partir de 16\/12\/2027.*divisor 200 \(duzentos\)/);
  assert.match(clausula(ana, "Salário-hora").texto, /não constitui reajuste/);
  assert.deepEqual(ana.clausulas.map((c) => c.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("contrato de até 40h mantém a carga (art. 4º), sem cláusula de distribuição nem segunda etapa", () => {
  const beto = montar(estado()).termos[1];
  assert.match(clausula(beto, "Duração do trabalho").texto, /Fica mantida a duração contratual de 36 horas.*art\. 4º/);
  assert.match(clausula(beto, "Remuneração").texto, /^O incremento do repouso semanal remunerado não implica/);
  assert.equal(clausula(beto, "Distribuição diária da jornada"), undefined);
  assert.equal(clausula(beto, "Segunda etapa da redução"), undefined);
  assert.match(beto.partes, /CTPS nº _{6,}, série _{6,}/);
});

test("ACT/CCT vigente preenche o fundamento da distribuição diária", () => {
  const { termos } = montar(estado({ instrumentoCompensacao: "act_cct", instrumentoColetivo: {
    ...base().instrumentoColetivo, identificacao: "CCT Comércio Ficticio 2026/2027", inicio: "2026-12-01", fim: "2027-11-30",
    compativelEC141: true, compensacaoDiaria: true, limiteDiario: 9 } }));
  assert.match(clausula(termos[0], "Distribuição diária da jornada").texto, /CCT Comércio Ficticio 2026\/2027, vigente de 01\/12\/2026 a 30\/11\/2027/);
});

test("exige proposta atualizada e nomeia listas de dias", () => {
  const s = estado(); s.conversao.desatualizada = true;
  assert.throws(() => montar(s), /proposta 5×2 atualizada/);
  assert.equal(listaDias([1, 2, 3, 4, 5]), "segunda a sexta-feira");
  assert.equal(listaDias([1, 3, 5]), "segunda, quarta e sexta-feira");
  assert.equal(listaDias([3, 0]), "quarta-feira e domingo");
  assert.equal(listaDias([6, 0]), "sábado e domingo");
});

test("gera PDF e Word válidos com as cláusulas e a tabela de horário", () => {
  const { termos, titulo } = montar(estado());
  const pdf = new Uint8Array(criarPdfTermo(termos[0], titulo, libs));
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  const partes = libs.unzipSync(criarDocxTermo(termos[0], titulo, libs));
  assert.deepEqual(Object.keys(partes).sort(), ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  const documento = new TextDecoder().decode(partes["word/document.xml"]);
  assert.match(documento, /TERMO ADITIVO AO CONTRATO INDIVIDUAL DE TRABALHO/);
  assert.match(documento, /CLÁUSULA 7ª – DISTRIBUIÇÃO DIÁRIA DA JORNADA/);
  assert.match(documento, /<w:tbl>.*Segunda a sexta-feira.*12:00 às 13:36/);
  assert.match(documento, /Testemunha 2 – Nome:/);
  assert.doesNotMatch(documento, /<script|&(?!amp;|lt;|gt;|quot;)/);
});

test("com empresa do servidor, razão social e CNPJ cadastrados prevalecem sobre o relatório", () => {
  const { termos } = montar(estado(), { servidor: { nome: "COMERCIO OFICIAL LTDA", cnpj: "11444777000161" } });
  assert.match(termos[0].partes, /^COMERCIO OFICIAL LTDA, inscrita no CNPJ sob o nº 11\.444\.777\/0001-61/);
  assert.equal(termos[0].empresa.nome, "COMERCIO OFICIAL LTDA");
});
