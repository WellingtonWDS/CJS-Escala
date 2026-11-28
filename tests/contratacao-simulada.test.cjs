const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenarios, converter, montarTermos;
before(async () => {
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ montarTermosAditivos: montarTermos } = await import("../assets/js/export/termo-aditivo.js"));
});
const equipeReduzida = () => cenarios()[0].drafts[2].state; // Comércio — equipe reduzida: contratar

test("capacidade insuficiente sugere contratação por função, com a carga da fase", () => {
  const s = equipeReduzida();
  const c = converter(s, s.destinoConversao);
  assert.equal(c.comparacao.status, "insuficiente");
  assert.deepEqual(c.comparacao.contratacaoSugerida.map((x) => [x.funcao, x.quantidade, x.horasSemana]).sort(), [["Atendente", 1, 42], ["Caixa", 1, 42]]);
  assert.deepEqual(c.comparacao.contratados, []);
});

test("contratação incluída: pessoas a contratar com horário e folgas na proposta, origem intacta", () => {
  const s = equipeReduzida();
  const sem = converter(s, s.destinoConversao);
  const contratacoes = sem.comparacao.contratacaoSugerida.map((x) => ({ funcao: x.funcao, horasSemana: x.horasSemana }));
  const c = converter(s, { ...s.destinoConversao, contratacoes });
  const novos = c.proposta.config.escalaGerada.resultado.filter((r) => r.colaborador.aContratar);
  assert.deepEqual(novos.map((r) => r.colaborador.nome), ["A contratar 1 — Atendente", "A contratar 2 — Caixa"]);
  assert.equal(c.origem.escala.resultado.length, s.colaboradores.length, "a escala atual não ganha ninguém");
  for (const r of novos) {
    const semana = r.dias.filter((d) => d.data >= "2027-01-11" && d.data <= "2027-01-17");
    assert.equal(semana.filter((d) => d.status === "T").length, 5);
    assert.equal(Math.round(semana.reduce((a, d) => a + d.horas, 0) * 100) / 100, 42);
  }
  assert.ok(c.comparacao.faltantesDepois < sem.comparacao.faltantesDepois / 2);
  assert.notEqual(c.comparacao.status, "insuficiente");
  assert.equal(c.comparacao.contratados.length, 2);
  // Termos aditivos só para quem já tem contrato.
  const termos = montarTermos({ ...s, conversao: c }).termos;
  assert.equal(termos.length, s.colaboradores.length);
});
