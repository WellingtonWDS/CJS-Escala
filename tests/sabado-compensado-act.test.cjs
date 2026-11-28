const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let cenarios, converter, funcionamento;
before(async () => {
  ({ criarCenariosSegmentos: cenarios } = await import("../database/demo/segmentos.mjs"));
  ({ converterEscala: converter } = await import("../assets/js/domain/conversao.js"));
  ({ funcionamentoDoDia: funcionamento } = await import("../assets/js/domain/janelas-planejamento.js"));
});
const act = (s) => {
  s.instrumentoCompensacao = "act_cct";
  Object.assign(s.instrumentoColetivo, { identificacao: "CCT teste", inicio: "2026-01-01", fim: "2029-12-31", compativelEC141: true, compensacaoDiaria: true, limiteDiario: 10 });
};
const semana = (r) => r.dias.filter((d) => d.data >= "2027-03-08" && d.data <= "2027-03-14");

test("margem da aba Jornada amplia o funcionamento usado na proposta", () => {
  const s = cenarios()[0].drafts[0].state;
  const base = funcionamento(s, 1);
  const com = funcionamento({ ...s, margemAntesAbertura: 30, margemDepoisFechamento: 60 }, 1);
  assert.equal(com.entrada, base.entrada - 30);
  assert.equal(com.saida, base.saida + 60);
});

test("com ACT de compensação diária e margem, parte da equipe trabalha no sábado e fecha 42h nos demais dias", () => {
  const s = cenarios()[0].drafts[0].state; // comércio: seg–sex 08–18, sábado 08–14, cobertura no sábado
  act(s);
  s.margemDepoisFechamento = 60;
  const c = converter(s, { ...s.destinoConversao, periodo: "2027-03", fase: "transicao42", folgas: "distribuir" });
  const resultado = c.proposta.config.escalaGerada.resultado;
  const noSabado = resultado.filter((r) => semana(r).some((d) => d.weekday === 6 && d.status === "T"));
  assert.ok(noSabado.length >= 2, "parte da equipe escalada no sábado");
  for (const r of resultado) {
    const dias = semana(r);
    assert.equal(dias.filter((d) => d.status === "T").length, 5);
    assert.equal(dias.reduce((a, d) => a + d.horas, 0).toFixed(2), "42.00", r.colaborador.nome);
    assert.ok(dias.every((d) => d.horas <= 10));
  }
  for (const r of noSabado) assert.ok(semana(r).filter((d) => d.weekday !== 6 && d.status === "T").every((d) => d.horas > 8.4), "dias úteis compensam o sábado reduzido");
  assert.equal(c.comparacao.faltantesDepois, 0);
});

test("sem ACT, ninguém perde horas para trabalhar no sábado curto; a recomendação cita as alternativas", () => {
  const s = cenarios()[0].drafts[0].state;
  const c = converter(s, { ...s.destinoConversao, periodo: "2027-03", fase: "transicao42", folgas: "distribuir" });
  assert.ok(c.comparacao.pessoas.every((p) => !p.deficits));
  assert.match(c.comparacao.jornadaCurta.join(" "), /ACT\/CCT com compensação diária.*revezamento quinzenal do sábado/);
});
