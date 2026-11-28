const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenarios, converter, preparar, criarPdf, libs;
before(async () => {
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ prepararRelatorio: preparar } = await import("../assets/js/export/relatorio.js"));
  ({ criarPdf } = await import("../assets/js/export/pdf.js"));
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  libs = { jsPDF, autoTable };
});
const estado = (fixa) => {
  const s = cenarios().at(-1).drafts[0].state;
  if (fixa) Object.assign(s, { modeloEscala: "fixa", dataReferenciaFixa: "2026-12-16" });
  s.conversao = converter(s, s.destinoConversao);
  return s;
};
const textos = (bytes) => [...Buffer.from(bytes).toString("latin1").matchAll(/\((.*?)\) Tj|\[\((.*?)\)\]/g)].map((m) => m[1] || m[2]).join(" | ");

test("quadro da escala: uma célula por dia com horário, intervalo ou situação", () => {
  const rel = preparar(estado(false), { proposta: true, empresa: "Lanchonete" });
  const p = rel.pessoas[0];
  assert.equal(p.quadro.length, p.linhas.length);
  const trabalho = p.quadro.find((d) => d.trabalho);
  assert.match(trabalho.texto, /^\d{2}:\d{2}–\d{2}:\d{2}.*\nInt\. \d{2}:\d{2}–\d{2}:\d{2}$/);
  assert.ok(p.quadro.some((d) => !d.trabalho && d.texto === "Folga"));
});

test("PDF do quadro: semanas na escala dinâmica e padrão semanal na fixa", async () => {
  const dinamica = await criarPdf(preparar(estado(false), { proposta: true }), preparar(estado(false), { proposta: true }).pessoas, { libs, quadro: true });
  const t = textos(dinamica);
  assert.match(t, /Quadro da escala/);
  assert.match(t, /Semana de 04\/01 a 10\/01\/2027/);
  assert.match(t, /Seg 04\/01/);
  const relFixa = preparar(estado(true), { proposta: true });
  const fixa = textos(await criarPdf(relFixa, relFixa.pessoas, { libs, quadro: true }));
  assert.match(fixa, /Padr\\?\S*o semanal recorrente/);
  assert.doesNotMatch(fixa, /Semana de/);
  // Sem as seções do relatório do empregador.
  assert.doesNotMatch(fixa, /Carga semanal|Pontos de aten/);
});
