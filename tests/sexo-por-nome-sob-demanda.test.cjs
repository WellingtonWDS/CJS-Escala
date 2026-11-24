const { test } = require("node:test");
const assert = require("node:assert/strict");
test("base de nomes sob demanda: antes de carregar nada é inferido nem apagado", async () => {
  const m = await import("../assets/js/domain/sexo-por-nome.js");
  assert.equal(m.baseNomesCarregada(), false);
  const c = { nome: "Maria Silva", sexo: "feminino", sexoOrigem: "nome", sexoInferencia: { sexo: "feminino" }, quadroDominio: {} };
  assert.equal(m.preencherSexoPorNome(c), false);
  assert.equal(c.sexo, "feminino", "não limpa o sexo já estimado");
  assert.equal(m.inferirSexoPorNome("Maria Silva"), null);
  const [a, b] = await Promise.all([m.carregarBaseNomes(), m.carregarBaseNomes()]);
  assert.equal(a, b, "uma única carga");
  assert.equal(m.baseNomesCarregada(), true);
  assert.equal(m.inferirSexoPorNome("Maria Silva")?.sexo, "feminino");
  assert.match(m.inferirSexoPorNome("João Souza").fonte, /IBGE/);
});
