const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const pdfSciFicticio = require("./helpers/pdf-sci-ficticio.cjs");
let lerPdfSCI, analisar, diasSCI, prepararDominio, base;
const carregar = async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return pdfjs;
};
before(async () => {
  ({ lerPdfSCI } = await import("../assets/js/import/arquivo-sci.js"));
  ({ analisarHorarioSCI: analisar, diasSCI } = await import("../assets/js/import/sci.js"));
  ({ prepararDominio } = await import("../assets/js/import/dominio.js"));
  ({ createDefaultState: base } = await import("../assets/js/state/store.js"));
});
const ler = async (opcoes) => analisar(await lerPdfSCI(await pdfSciFicticio(opcoes), carregar), "horario.pdf");

test("lê empresa, funcionários, cargos, carteira e horários do PDF da SCI", async () => {
  const q = await ler();
  assert.equal(q.empresa.nome, "COMERCIO FICTICIO EXEMPLO LTDA");
  assert.equal(q.empresa.sistema, "SCI");
  assert.equal(q.empresa.cnpj, "");
  assert.equal(q.empresa.licenciadoPara, "ESCRITORIO FICTICIO CONTABIL");
  assert.match(q.empresa.endereco, /RUA DAS AMOSTRAS 100/);
  assert.match(q.empresa.atividade, /^4781400/);
  assert.deepEqual(q.colaboradores.map((c) => c.quadroDominio.codigo), ["11", "12", "13"]);
  const [ana, bruno, carla] = q.colaboradores;
  assert.equal(ana.cargo, "VENDEDOR (A)");
  assert.equal(ana.quadroDominio.ctps, "1234567");
  assert.equal(ana.quadroDominio.serie, "00011");
  assert.deepEqual(ana.quadroDominio.semana[1].jornada, { entrada: "08:00", intInicio: "11:00", intFim: "13:00", saida: "18:00" });
  assert.equal(ana.quadroDominio.semana[6].status, "trabalho");
  assert.equal(ana.quadroDominio.semana[6].jornada.saida, "12:00");
  assert.equal(ana.quadroDominio.semana[0].status, "folga");
  assert.equal(ana.quadroDominio.modelo, "6x1");
  // Cargo longo com carteira em linha separada.
  assert.equal(bruno.cargo, "MONTADOR APARELHOS ELETROELETRONICOS");
  assert.equal(bruno.quadroDominio.ctps, "7654321");
  assert.equal(bruno.quadroDominio.semana[3].jornada.intInicio, "14:00");
  // Sábado listado na linha principal, sem linha especial.
  assert.equal(carla.quadroDominio.semana[6].jornada.entrada, "09:00");
  assert.equal(carla.quadroDominio.admissao, "");
});

test("relatório em várias páginas reúne todos os funcionários sem duplicar", async () => {
  const q = await ler({ paginas: 2 });
  assert.equal(q.colaboradores.length, 3);
  assert.deepEqual(q.empresa.paginas, ["1", "2"]);
});

test("abreviações e intervalos de dias", () => {
  assert.deepEqual(diasSCI("Seg, Ter, Qua, Qui, Sex"), [1, 2, 3, 4, 5]);
  assert.deepEqual(diasSCI("Seg a Sex"), [1, 2, 3, 4, 5]);
  assert.deepEqual(diasSCI("SÁBADO"), [6]);
  assert.deepEqual(diasSCI("Domingo"), [0]);
  assert.equal(diasSCI("Feriado"), null);
});

test("rejeita PDF que não é o Horário de Trabalho e arquivo que não é PDF", async () => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF(); doc.text("Recibo qualquer", 10, 10);
  await assert.rejects(async () => analisar(await lerPdfSCI(doc.output("arraybuffer"), carregar)), /Horário de Trabalho da SCI/);
  await assert.rejects(() => lerPdfSCI(new TextEncoder().encode("nao e pdf").buffer, carregar), /arquivo PDF/);
});

test("aplica no cadastro com o CNPJ informado e identifica a escala 6×1", async () => {
  const q = await ler();
  q.empresa.cnpj = "11.222.333/0001-81";
  const s = base(new Date(2026, 10, 18));
  const novo = prepararDominio(s, q, "substituir");
  assert.equal(novo.colaboradores.length, 3);
  assert.equal(novo.empresaDominio.cnpj, "11.222.333/0001-81");
  assert.equal(novo.tipoEscala, "6x1");
  assert.deepEqual(novo.diasTrabalho, [1, 2, 3, 4, 5, 6]);
  // Adicionar de outra empresa (outro CNPJ) é recusado, como na Domínio.
  const outro = structuredClone(q); outro.empresa.cnpj = "11.444.777/0001-61";
  assert.throws(() => prepararDominio({ ...s, ...novo }, outro, "adicionar"), /outra empresa/);
});
